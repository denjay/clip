import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'

// 指定数据文件路径,不存在就创建
const clipboardDatasPath = path.join(app.getPath('userData'), 'clipboard_datas.json')
fs.access(clipboardDatasPath).catch(async () => {
  await fs.writeFile(clipboardDatasPath, JSON.stringify([], null, 4))
})

export async function getClipDataList(searchString?: string) {
  const dataList = JSON.parse((await fs.readFile(clipboardDatasPath, 'utf-8')) || '[]')
  if (searchString && dataList.length) {
    const lowerCase = searchString.toLowerCase()
    return dataList.filter(({ content }) => content.toLowerCase().includes(lowerCase))
  } else {
    return dataList
  }
}

export async function addClipData(clipboardData: ClipboardData) {
  const dataList = JSON.parse((await fs.readFile(clipboardDatasPath, 'utf-8')) || '[]')
  if (dataList[0]?.type === clipboardData.type && dataList[0]?.content === clipboardData.content)
    return
  dataList.unshift(clipboardData)
  await fs.writeFile(clipboardDatasPath, JSON.stringify(dataList, null, 4))
}

export async function deleteOneData(creationTime: number) {
  const dataList = await getClipDataList()
  const index = dataList.findIndex(
    ({ creationTime: dataCreationTime }) => dataCreationTime === creationTime
  )
  dataList.splice(index, 1)
  await fs.writeFile(clipboardDatasPath, JSON.stringify(dataList, null, 4))
}

export async function setClipboardDatas(clipboardDatas: ClipboardData[]) {
  await fs.writeFile(clipboardDatasPath, JSON.stringify(clipboardDatas, null, 4))
}

export async function changeOneData(clipboardData: ClipboardData) {
  const dataList = await getClipDataList()
  Object.assign(
    dataList.find(({ creationTime }) => creationTime === clipboardData.creationTime),
    clipboardData
  )
  await fs.writeFile(clipboardDatasPath, JSON.stringify(dataList, null, 4))
}