const {parentPort,workerData}=require('node:worker_threads');
const {readZcode}=require('./zcode-reader.cjs');
parentPort.postMessage(readZcode(workerData.file,workerData.range,workerData.filters,workerData.prices));
