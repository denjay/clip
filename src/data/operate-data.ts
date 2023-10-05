import fs from 'fs/promises'

export async function getClipDataList(searchString?: string) {
  const dataList = JSON.parse((await fs.readFile('src/data/clipboard-datas.json', 'utf-8')) || '[]')
  if (searchString) {
    return dataList.filter(({ content }) => content.includes(searchString))
  } else {
    return dataList
  }
}
export async function getClipContent(creationTime: number) {
  const dataList = JSON.parse((await fs.readFile('src/data/clipboard-datas.json', 'utf-8')) || '[]')
  return dataList.find((item: { creationTime: number }) => item.creationTime === creationTime)
    .content
}

export async function addClipData(data) {
  const dataList = JSON.parse((await fs.readFile('src/data/clipboard-datas.json', 'utf-8')) || '[]')
  dataList.unshift(data)
  await fs.writeFile('src/data/clipboard-datas.json', JSON.stringify(dataList, null, 4))
}

export async function deleteOneData(creationTime: number) {
  const dataList = await getClipDataList()
  const index = dataList.findIndex(
    ({ creationTime: dataCreationTime }) => dataCreationTime === creationTime
  )
  dataList.splice(index, 1)
  await fs.writeFile('src/data/clipboard-datas.json', JSON.stringify(dataList, null, 4))
}

export async function deleteAllData() {
  await fs.writeFile('src/data/clipboard-datas.json', '[]')
}
