require('dotenv').config()
const fetch = require('node-fetch')
const fs = require('fs')
const { argv } = require('yargs')

// UTILS

const isLog = argv.log
const envJql = argv.query
const envFileName = argv.write

// FETCH

const auth = `Basic ${Buffer.from(`${process.env.JLOG_LOGIN}:${process.env.JLOG_API_TOKEN}`).toString('base64')}`

const fetchJira = (url) => fetch(url, {
    method: 'GET',
    headers: {
        'Authorization': auth,
        'Accept': 'application/json',
    }
})
.then((response) => response.json())


// URLS

const baseUrl = `https://${process.env.JLOG_API_DOMAIN}.atlassian.net/rest/api/3`

const createUrl = (appendStr) => `${baseUrl}${appendStr}`

// const taskUrl = (taskId) => createUrl(`/issue/${taskId}/`)
const taskSearchUrl = (jql) => createUrl(`/search?jql=${encodeURIComponent(jql)}`)

// const query = `project = Till AND worklogAuthor = Valerii AND worklogDate >= 2020-07-15 AND worklogDate <= 2020-07-15`
const query = envJql || `project = Till AND worklogAuthor = Valerii AND worklogDate >= 2020-07-01 AND worklogDate <= 2020-07-31`

// RUN

fetchJira(taskSearchUrl(query))

// HANDLE TASKS SEARCH
.then(data => data.issues || [])

// FETCH TASKS FULL MODEL
.then(issues => Promise.all(issues.map(issue => fetchJira(issue.self))))

// FORMAT TASKS WORKLOG
.then(tasks => {
    const list = tasks.map(formatTask)
    const total = list.reduce(reduceTotal, { seconds: 0, minutes: 0, hours: 0 })
    return { list, total }
})

// OUTPUT
.then(writeToLog)
.then(writeToFile)


// UTILS

function formatTask(task) {
    return {
        key: task.key,
        name: task.fields.summary,
        worklogs: task.fields.worklog.worklogs

            // filter worklog by current login email
            .filter(wl => wl.author.emailAddress === process.env.JLOG_LOGIN)

            // format worklogs
            .map(wl => ({
                email: wl.author.emailAddress,
                name: wl.author.displayName,
                seconds: wl.timeSpentSeconds,
                minutes: Number(wl.timeSpentSeconds) / 60,
                hours: Number(wl.timeSpentSeconds) / 60 / 60,
            }))

            // sum worklogs under task
            .reduce((sum, val) => ({
                ...val,
                seconds: val.seconds + sum.seconds,
                minutes: val.minutes + sum.minutes,
                hours: val.hours + sum.hours,
            }), { seconds: 0, minutes: 0, hours: 0 })
    }
} 

function reduceTotal(sum, task) {
    return {
        seconds: sum.seconds + task.worklogs.seconds,
        minutes: sum.minutes + task.worklogs.minutes,
        hours: sum.hours + task.worklogs.hours,
    }
}

function writeToLog(result) {
    if (isLog) {
        const logTask = (task) => ({ ...task, worklogs: JSON.stringify(task.worklogs) })
        console.log({ ...result, list: result.list.map(logTask) })
    }
    return result
}

function writeToFile(result) {
    if (envFileName) {
        fs.writeFile(envFileName, JSON.stringify(result, null, 4), (error) => {
            if (error) {
                console.error(error)
            } else {
                console.log('file written -> ', envFileName)
            }
        })
    }
    return result
}
