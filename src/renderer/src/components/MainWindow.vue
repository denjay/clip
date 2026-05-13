<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed, nextTick, toRaw } from 'vue'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import Settings from './Settings.vue'
import { useConfigStore } from '../stores/config'

const config = useConfigStore()
const searchString = ref('')
const showSearchInput = ref(false) // 是否显示搜索框
const deleteConfirmVisible = ref(false) // 清空确认框
const searchInput = ref() // 获得搜索框dom
const scrollbarRef = ref() // 滚动条dom
const clipboardDatas: ClipboardData[] = reactive([])
const markMap = reactive(new Map()) // 记录标记信息
const deleteWhich = ref('all') // 'all' | 'normal'
const colorList = reactive([
  '#ec2c64',
  '#f46fa1',
  '#fba414',
  '#d5b2ac',
  '#84b6c0',
  '#b4ca5f',
  '#6c36b1'
])
const currentColor = ref('')
const mainWindowVisible = ref(false)

const windowsManager = new (class {
  windowsMap = new Map()
  async open(url: string, target: string, features?: string) {
    if (this.isOpen(target)) {
      await this.close(target)
    }
    const newWindow = window.open(url, target, features)
    if (newWindow) {
      this.windowsMap.set(target, newWindow)
      newWindow.addEventListener('beforeunload', () => {
        if (this.get(target) === newWindow) {
          this.windowsMap.delete(target)
        }
      })
    }
  }
  async close(target: string) {
    if (this.isOpen(target)) {
      const targetWindow = this.windowsMap.get(target)
      targetWindow.close()
      while (!targetWindow.closed) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      this.windowsMap.delete(target)
    }
  }
  isOpen(target: string) {
    return this.windowsMap.has(target) && !this.get(target).closed
  }
  get(target: string) {
    return this.windowsMap.get(target)
  }
})()

windowAddEventListener()
setBounds()
getClipDatas()

if (config.show) {
  window.api.execMainWindowMethod('show')
  mainWindowVisible.value = true
}

onMounted(async () => {
  addScrollEvent()
})

watch([searchString, currentColor, clipboardDatas], () => {
  bodyFocus()
  setTimeout(setMarkMap)
})

async function getClipDatas() {
  const clipDataList = await window.api.getClipDataList()
  if (config.number === 0 || config.time === 0) {
    clipboardDatas.splice(0, Infinity, ...clipDataList)
    return
  }
  if (config.expirationType === 'time') {
    const now = Date.now()
    const expirationTime = now - config.time * 24 * 60 * 60 * 1000
    clipboardDatas.splice(
      0,
      Infinity,
      ...clipDataList.filter(
        (clipData) =>
          clipData.creationTime >= expirationTime ||
          clipData.state ||
          clipData.color ||
          clipData.order
      )
    )
  } else {
    const specialItems: ClipboardData[] = []
    const nomalItems: ClipboardData[] = []
    for (const clipData of clipDataList) {
      if (clipData.state || clipData.color || clipData.order) {
        specialItems.push(clipData)
      } else {
        nomalItems.push(clipData)
      }
    }
    if (specialItems.length >= config.number) {
      clipboardDatas.splice(0, Infinity, ...specialItems.slice(0, config.number))
    } else {
      const requiredItems = [
        ...specialItems,
        ...nomalItems.slice(0, config.number - specialItems.length)
      ]
      requiredItems.sort((a, b) => b.creationTime - a.creationTime)
      clipboardDatas.splice(0, Infinity, ...requiredItems)
    }
  }
}

function changeOneData(clipboardData: ClipboardData, field: string, value: string | number) {
  clipboardData[field] = value
  window.api.changeOneData(toRaw(clipboardData))
}

function deleteOneData(creationTime: number) {
  const index = clipboardDatas.findIndex((item) => item.creationTime === creationTime)
  clipboardDatas.splice(index, 1)
  window.api.deleteOneData(creationTime)
}

function setClipboardDatas() {
  if (deleteWhich.value === 'all') {
    clipboardDatas.splice(0)
  } else if (deleteWhich.value === 'normal') {
    const lockedDataList = clipboardDatas.filter((i) => i.state !== '' || i.order)
    clipboardDatas.splice(0, Infinity, ...lockedDataList)
  }
  window.api.setClipboardDatas(toRaw(clipboardDatas))
}

async function paste(clipboardData: ClipboardData, field: 'text' | 'image') {
  await hideMainWindow()
  window.api.paste(toRaw(clipboardData), field)
}

async function hideMainWindow() {
  // windows系统下使用hide方法隐藏窗口会导致要粘贴的窗口不能获取焦点,从而粘贴失败
  // Linux系统下使用minimize方法隐藏窗口会出现窗口无法彻底消失的问题
  const method = navigator.userAgent.includes('Win') ? 'minimize' : 'hide'
  await window.api.execMainWindowMethod(method)
}

function handleContentClick(
  event: MouseEvent,
  clipboardData: ClipboardData,
  field: 'text' | 'image'
) {
  if (!window.getSelection()?.toString()) {
    if (event.ctrlKey) {
      preview('details', clipboardData, event, field)
    } else {
      paste(clipboardData, field)
    }
  }
}

function top(clipboardData: ClipboardData) {
  const minOrder = Math.min(...clipboardDatas.map(({ order }) => order))
  clipboardData.order = minOrder - 1
  changeOneData(clipboardData, 'order', clipboardData.order)
}

function nodeVisible(clipboardData: ClipboardData) {
  if (searchString.value) {
    if (clipboardData.text) {
      return (
        clipboardData.text.toLowerCase().includes(searchString.value.toLowerCase()) &&
        (currentColor.value ? currentColor.value === clipboardData.color : true)
      )
    } else {
      return false
    }
  } else {
    return currentColor.value ? currentColor.value === clipboardData.color : true
  }
}

function changeSearchInputVisibility(visibility?: boolean) {
  if (typeof visibility === 'boolean') {
    showSearchInput.value = visibility
  } else {
    showSearchInput.value = !showSearchInput.value
  }
  if (showSearchInput.value) {
    // 显示搜索框后自动获取焦点
    nextTick(() => {
      searchInput.value.focus()
    })
  } else {
    // 隐藏搜索框后清空搜索字符串,重新获取所有剪贴板数据
    searchString.value = ''
  }
}

function highlightSearchString(text: string) {
  // 转义
  text = text.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] || c
  )
  if (searchString.value) {
    text = text.replace(new RegExp(searchString.value, 'ig'), '<mark>$&</mark>')
  }
  return text
}

function addScrollEvent() {
  const scrollBar = document.querySelector('#body .scroll-bar-wrap-class')!
  scrollBar.addEventListener('scroll', () => windowsManager.close('details'))
  scrollBar.addEventListener('scrollend', setMarkMap)
}

function setMarkMap() {
  markMap.clear()
  if (clipboardDatas.length === 0) return
  let count = 1
  const { scrollTop, clientHeight } = document.querySelector(
    '#body .scroll-bar-wrap-class'
  ) as HTMLElement
  const nodeList = Array.from(
    document.querySelectorAll('#body .clipboard-item') as NodeListOf<HTMLElement>
  )
  nodeList.sort((a, b) => {
    return Number(a.style.order) - Number(b.style.order)
  })
  for (const node of nodeList) {
    const creationTime = Number(node.dataset['creationTime'])
    if (node.style.display === '') {
      const footerNode = node.querySelector('.footer') as HTMLElement
      if (
        footerNode.offsetTop + 10 >= scrollTop &&
        footerNode.offsetTop <= scrollTop + clientHeight
      ) {
        markMap.set(creationTime, count++)
      } else {
        markMap.set(creationTime, '') // 表示在视口外
      }
    } else {
      markMap.set(creationTime, null) // null表示display为none
    }
  }
}

function deltaTime(creationTime: number) {
  let delta = Date.now() - creationTime
  const binaryInfoList = [
    { unit: '毫秒', binary: 1000, last: 0 },
    { unit: '秒', binary: 60, last: 0 },
    { unit: '分钟', binary: 60, last: 0 },
    { unit: '小时', binary: 24, last: 0 },
    { unit: '天', binary: Infinity, last: 0 }
  ]
  for (const binaryInfo of binaryInfoList) {
    binaryInfo.last = delta % binaryInfo.binary
    delta = Math.floor(delta / binaryInfo.binary)
    if (delta === 0) break
  }
  const maxUnitItem = binaryInfoList.findLast((i) => i.last)
  if (maxUnitItem && maxUnitItem.unit !== '毫秒') {
    return `${maxUnitItem.last}${maxUnitItem.unit}前`
  } else {
    return '刚刚'
  }
}

async function getContentInfo(
  clipboardData: ClipboardData,
  field: 'text' | 'image'
): Promise<{ contentWidth: number; contentHeight: number; renderedHTML: string }> {
  const details = document.querySelector('#details')!
  if (field === 'text') {
    // 如果包含特殊字符,就高亮处理,否则当作纯文本
    if (clipboardData.text.search(/[[\]{}<>=]/g) !== -1) {
      details.innerHTML = hljs.highlightAuto(clipboardData.text).value
    } else {
      details.innerHTML = hljs.highlight(clipboardData.text, { language: 'plaintext' }).value
    }
    const renderedHTML = details.innerHTML
    const { scrollWidth, scrollHeight } = details
    details.innerHTML = ''
    return { contentWidth: scrollWidth, contentHeight: scrollHeight, renderedHTML }
  } else {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = clipboardData.image
      img.onload = function () {
        resolve({
          contentWidth: img.width,
          contentHeight: img.height + 10,
          renderedHTML: img.outerHTML
        })
      }
    })
  }
}

async function preview(
  path: string,
  clipboardData: ClipboardData,
  event: MouseEvent,
  field: 'text' | 'image'
) {
  // 点击同一个预览图标时,隐藏已显示的详情窗口
  if (
    windowsManager.isOpen('details') &&
    field === window.sessionStorage.getItem('field') &&
    windowsManager.get('details').location.hash.match(/creationTime=(\d+)$/)?.[1] ===
      String(clipboardData.creationTime)
  ) {
    windowsManager.close('details')
    return
  }

  const { screenX, screenY, clientX, clientY } = event // 点击处离窗口左上角的距离
  // 主窗口左上角坐标
  const mainWindowX = screenX - clientX
  const mainWindowY = screenY - clientY
  const { availWidth, availHeight } = window.screen // 屏幕可用的宽度和高度(不包括任务栏)
  const { top, bottom } = document
    .querySelector(`.clipboard-item[data-creation-time="${clipboardData.creationTime}"]`)!
    .getBoundingClientRect()
  // 详情窗口允许的最大宽高
  const maxWidth = Math.max(mainWindowX, availWidth - (mainWindowX + window.innerWidth))
  const maxHeight = Math.max(availHeight - (top + mainWindowY), bottom)
  const { contentWidth, contentHeight, renderedHTML } = await getContentInfo(clipboardData, field) // pre内容区的宽高
  const width = Math.min(maxWidth, Math.max(contentWidth + 30, 200)) // 30为详情窗口内pre与窗口的间距
  const height = Math.min(maxHeight, Math.max(contentHeight + 30, bottom - top + 10))
  const x =
    mainWindowX + window.innerWidth + width > availWidth
      ? mainWindowX - width + 5
      : mainWindowX + window.innerWidth - 5
  const y =
    top + mainWindowY + height > availHeight
      ? bottom + mainWindowY - height + 5
      : top + mainWindowY - 5

  window.sessionStorage.setItem('clipboardData', JSON.stringify(clipboardData))
  window.sessionStorage.setItem('highlineHTML', renderedHTML)
  window.sessionStorage.setItem('field', field)
  windowsManager.open(
    `#/${path}?creationTime=${clipboardData.creationTime}`,
    path,
    `width=${width},height=${height},x=${x},y=${y}`
  )
}

async function setBounds() {
  const { availWidth, availHeight } = window.screen
  const width = Math.floor(config.width)
  const height = Math.floor(availHeight * config.heightRate)
  if (config.mainWindowPosition === 'follow-mouse') {
    const { x: mousePositionX, y: mousePositionY } = await window.api.getMousePosition()
    const maxX = availWidth - width
    const maxY = availHeight - height
    const x = Math.max(0, Math.min(maxX, mousePositionX - width / 2))
    const y = Math.max(0, Math.min(maxY, mousePositionY - height / 2))
    window.resizeTo(width, height)
    window.moveTo(x, y)
  } else if (config.mainWindowPosition === 'right') {
    window.resizeTo(width, availHeight)
    window.moveTo(availWidth - width, 0)
  } else if (config.mainWindowPosition === 'left') {
    window.resizeTo(width, availHeight)
    window.moveTo(0, 0)
  }
}

function windowAddEventListener() {
  window.addEventListener('message', ({ data }) => {
    if (data.type === 'setBounds') {
      setBounds()
    } else if (data.type === 'refreshClipDatas') {
      getClipDatas()
    }
  })

  // 滚轮调节透明度
  window.addEventListener('wheel', (e) => {
    const delta = 5 * (e.deltaY > 0 ? 1 : -1)
    if (e.ctrlKey) {
      if (config.transparency + delta >= 0 && config.transparency + delta <= 100) {
        config.transparency += delta
      }
    }
  })

  window.addEventListener('resize', setMarkMap)

  // 设置操作快捷键
  window.addEventListener('keyup', (e: KeyboardEvent) => {
    console.log(e.key)
    if (e.key.match(/^\d$/)) {
      let creationTime: number | undefined
      for (const [key, value] of markMap) {
        if (value === Number(e.key)) {
          creationTime = key
          break
        }
      }
      if (creationTime) {
        const clipboardData = clipboardDatas.find((i) => i.creationTime === creationTime)!
        paste(clipboardData, clipboardData.text ? 'text' : 'image')
      }
    } else if (e.ctrlKey && e.key === 'f') {
      // 搜索快捷键
      changeSearchInputVisibility()
    } else if (e.key === '[' || e.key === 'PageUp') {
      let creationTime: number | undefined
      for (const [key, value] of markMap) {
        if (value) {
          creationTime = key
          break
        }
      }
      if (creationTime) {
        document
          .querySelector(`.clipboard-item[data-creation-time="${creationTime}"]`)
          ?.scrollIntoView({ block: 'end', behavior: 'smooth' })
      }
    } else if (e.key === ']' || e.key === 'PageDown') {
      let creationTime: number | undefined
      for (const [key, value] of [...markMap].reverse()) {
        if (value) {
          creationTime = key
          break
        }
      }
      if (creationTime) {
        document
          .querySelector(`.clipboard-item[data-creation-time="${creationTime}"]`)
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    } else if (e.key === 'Home') {
      scrollToTop()
    } else if (e.key === 'End') {
      scrollToBottom()
    } else if (e.key === 'Escape') {
      // 如果显示了详情窗口,则关闭详情窗口,否则关闭主窗口
      if (windowsManager.isOpen('details')) {
        windowsManager.close('details')
      } else {
        hideMainWindow()
      }
    }
  })
}

function handleSearchInputKeyUp(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    changeSearchInputVisibility(false)
  } else if (e.ctrlKey && e.key.match(/^\d$/)) {
    let creationTime: number | undefined
    for (const [key, value] of markMap) {
      if (value === Number(e.key)) {
        creationTime = key
        break
      }
    }
    if (creationTime) {
      const clipboardData = clipboardDatas.find((i) => i.creationTime === creationTime)!
      paste(clipboardData, clipboardData.text ? 'text' : 'image')
    }
  }
}

const showArrowUp = computed(() => {
  let result = false
  for (const item of markMap) {
    if (item[1]) {
      result = false
      break
    } else if (item[1] === '') {
      result = true
      break
    }
  }
  return result
})

const showArrowDown = computed(() => {
  let result = false
  for (const item of [...markMap].reverse()) {
    if (item[1]) {
      result = false
      break
    } else if (item[1] === '') {
      result = true
      break
    }
  }
  return result
})

const transform = computed(() => {
  if (!mainWindowVisible.value) {
    if (config.mainWindowPosition === 'left') {
      return `translate(-${config.width}px, 0)`
    } else if (config.mainWindowPosition === 'right') {
      return `translate(${config.width}px, 0)`
    } else if (config.mainWindowPosition === 'follow-mouse') {
      return `translate(0, ${window.screen.availHeight * config.heightRate}px)`
    }
  }
  return `translate(0, 0)`
})

function scrollToTop() {
  scrollbarRef.value!.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollToBottom() {
  const scrollHeight = document.querySelector('.scroll-bar-view-class')!.scrollHeight
  scrollbarRef.value!.scrollTo({ top: scrollHeight, behavior: 'smooth' })
}

window.api.onMessage(async (_event, message: string) => {
  switch (message) {
    case 'updatePageData':
      await getClipDatas()
      scrollToTop()
      break
    case 'hideMainWindow':
      mainWindowVisible.value = false
      hideMainWindow()
      windowsManager.close('details')
      break
    case 'showMainWindow':
      if (config.mainWindowPosition === 'follow-mouse') setBounds()
      mainWindowVisible.value = true
      // 清除选中文本
      window.getSelection()?.removeAllRanges()
      break
  }
})

// 使popover失去焦点
function bodyFocus() {
  void (document.querySelector('body') as HTMLElement).click()
}
</script>

<template>
  <div id="wrapper" :style="{ '--transparency': config.transparency / 100, transform }">
    <div id="head">
      <div>
        <el-popover placement="bottom-end" :width="200" trigger="click">
          <template #reference>
            <b
              id="title"
              :style="{ color: currentColor || '#000000' }"
              title="单击进行标记过滤(右键取消标记)"
              @click.right="currentColor = ''"
              >剪贴板</b
            >
          </template>
          <div class="color">
            <div
              v-for="color of colorList"
              :key="color"
              :style="{
                backgroundColor: color,
                borderColor: currentColor === color ? color : undefined
              }"
              @click="currentColor = currentColor === color ? '' : color"
            ></div>
          </div>
        </el-popover>
        <div
          v-show="!windowsManager.isOpen('details') && config.mainWindowPosition === 'follow-mouse'"
          id="move"
        ></div>
        <span>
          <el-icon v-show="showArrowUp" title="顶部 (Home)" @click="scrollToTop">
            <ArrowUp />
          </el-icon>
          <el-icon v-show="showArrowDown" title="底部 (End)" @click="scrollToBottom">
            <ArrowDown />
          </el-icon>
          <el-popconfirm
            :visible="deleteConfirmVisible"
            :title="`确定清空${deleteWhich === 'all' ? '所有' : '一般'}项?`"
            confirm-button-text="是"
            cancel-button-text="否"
            :width="165"
            @confirm="
              () => {
                deleteConfirmVisible = false
                setClipboardDatas()
              }
            "
            @cancel="deleteConfirmVisible = false"
          >
            <template #reference>
              <el-icon
                v-show="clipboardDatas.length"
                title="左键清空一般项,右键清空所有项"
                @click="
                  deleteWhich === 'all'
                    ? ((deleteWhich = 'normal'), (deleteConfirmVisible = true))
                    : (deleteConfirmVisible = !deleteConfirmVisible)
                "
                @click.right="
                  deleteWhich === 'normal'
                    ? ((deleteWhich = 'all'), (deleteConfirmVisible = true))
                    : (deleteConfirmVisible = !deleteConfirmVisible)
                "
              >
                <Delete />
              </el-icon>
            </template>
          </el-popconfirm>

          <el-icon
            v-show="!(!showSearchInput && !clipboardDatas.length)"
            title="搜索 (Ctrl+F)"
            @click="changeSearchInputVisibility()"
          >
            <Search />
          </el-icon>
          <el-popover :width="200" trigger="hover" placement="bottom-end" :show-arrow="false">
            <template #reference>
              <el-icon title="设置">
                <Setting />
              </el-icon>
            </template>
            <Settings></Settings>
          </el-popover>
        </span>
      </div>
      <div v-show="showSearchInput">
        <el-input
          ref="searchInput"
          v-model="searchString"
          placeholder="搜索"
          clearable
          @keyup.stop="handleSearchInputKeyUp"
        />
      </div>
    </div>
    <div
      v-show="clipboardDatas.length"
      id="body"
      :style="{ height: `calc(100vh - ${showSearchInput ? 32 : 0}px - 70px)` }"
    >
      <el-scrollbar
        ref="scrollbarRef"
        wrap-class="scroll-bar-wrap-class"
        view-class="scroll-bar-view-class"
      >
        <div
          v-for="clipboardData of clipboardDatas"
          v-show="nodeVisible(clipboardData)"
          :key="clipboardData.creationTime"
          :data-creation-time="clipboardData.creationTime"
          class="clipboard-item"
          :style="{ order: clipboardData.order }"
        >
          <div
            class="head"
            @dblclick.self="
              changeOneData(clipboardData, 'state', clipboardData.state === '' ? 'locked' : '')
            "
            @click.middle.self="deleteOneData(clipboardData.creationTime)"
          >
            <div>
              <el-popover placement="right" :width="200" :teleported="false" trigger="click">
                <template #reference>
                  <b
                    :style="{
                      color: clipboardData.color || '#000000',
                      cursor: 'pointer'
                    }"
                    title="单击添加标记(右键取消标记)"
                    @click.right="changeOneData(clipboardData, 'color', '')"
                    >{{
                      clipboardData.text && clipboardData.image
                        ? '图文'
                        : clipboardData.text
                          ? '文字'
                          : '图片'
                    }}</b
                  >
                </template>
                <div class="color">
                  <div
                    v-for="color of colorList"
                    :key="color"
                    :style="{
                      backgroundColor: color,
                      borderColor: clipboardData.color === color ? color : undefined
                    }"
                    @click="
                      changeOneData(
                        clipboardData,
                        'color',
                        (clipboardData.color = clipboardData.color === color ? '' : color)
                      )
                    "
                  ></div>
                </div>
              </el-popover>
              <div
                v-show="clipboardData.order"
                class="topping"
                title="已置顶(单击取消置顶)"
                @click="changeOneData(clipboardData, 'order', 0)"
              >
                顶
              </div>
              <el-icon
                v-show="clipboardData.state === 'locked'"
                title="已锁定(单击解锁)"
                @click="changeOneData(clipboardData, 'state', '')"
              >
                <Lock />
              </el-icon>
            </div>
            <div>
              {{ deltaTime(clipboardData.creationTime) }}
            </div>
            <div>
              <el-icon
                v-show="clipboardData.state === ''"
                title="锁定"
                @click="changeOneData(clipboardData, 'state', 'locked')"
              >
                <Lock />
              </el-icon>
              <el-icon title="置顶" @click="top(clipboardData)">
                <Top />
              </el-icon>
              <el-icon title="删除" @click="deleteOneData(clipboardData.creationTime)">
                <Delete />
              </el-icon>
            </div>
          </div>
          <div class="content">
            <p
              v-if="clipboardData.text"
              title="点击粘贴文本"
              @click="handleContentClick($event, clipboardData, 'text')"
              v-html="highlightSearchString(clipboardData.text)"
            ></p>
            <div
              v-if="clipboardData.image"
              title="点击粘贴图片"
              @click="handleContentClick($event, clipboardData, 'image')"
            >
              <img :src="clipboardData.image" />
            </div>
          </div>
          <div class="footer">
            <div
              :title="
                markMap.get(clipboardData.creationTime) >= 1 &&
                markMap.get(clipboardData.creationTime) <= 9
                  ? `键${searchString ? 'Ctrl + ' : ''}${markMap.get(
                      clipboardData.creationTime
                    )}直接上屏`
                  : ''
              "
            >
              {{ markMap.get(clipboardData.creationTime) }}
            </div>
            <el-icon
              title="详情"
              tabindex="-1"
              @click="
                preview('details', clipboardData, $event, clipboardData.image ? 'image' : 'text')
              "
            >
              <View />
            </el-icon>
          </div>
        </div>
      </el-scrollbar>
    </div>
    <el-empty
      v-show="!clipboardDatas.length"
      :style="{ height: `calc(100vh - ${showSearchInput ? 32 : 0}px - 70px)` }"
      description="无数据"
    />
    <pre id="details"></pre>
    <div id="total">共 {{ clipboardDatas.length }} 条</div>
  </div>
</template>

<style lang="less">
#wrapper {
  margin: 10px;
  border-radius: 5px;
  background-color: rgba(255, 255, 255, var(--transparency));
  box-shadow: 0px 0px 10px rgba(0, 0, 0, var(--transparency));
  transition: transform 0.3s ease;
  user-select: none;

  #title {
    cursor: pointer;
    text-shadow: white 0px 0px 5px;
  }
}

#head > div {
  padding: 0 10px;

  &:first-child {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 35px;

    #move {
      flex-grow: 1;
      height: 100%;
      -webkit-app-region: drag;
    }

    span > i {
      cursor: pointer;
      margin-left: 10px;
    }
  }

  &:last-child .el-input__wrapper {
    background-color: inherit;

    input {
      color: black;
    }
  }
}

#body {
  overflow: hidden;
  padding-top: 10px;

  .scroll-bar-view-class {
    display: flex;
    flex-direction: column;
  }
  .clipboard-item {
    display: flex;
    flex-direction: column;
    border-radius: 5px;
    overflow: hidden;
    margin: 5px;
    box-shadow: 0px 0px 5px rgba(0, 0, 0, 0.3);
    min-height: 50px;
    transition: order 1s 0s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.9);

      .head > div {
        &:last-child {
          display: inline;
        }

        &:nth-child(2) {
          display: none;
        }
      }

      .footer {
        i {
          opacity: 1;
          outline-style: none;
        }
      }
    }

    .head {
      display: flex;
      justify-content: space-between;
      background-color: rgba(255, 255, 255, 0.9);
      padding: 3px 10px;
      user-select: none;

      i {
        cursor: pointer;
      }

      > div:first-child {
        display: flex;
        align-items: center;
        font-size: 14px;
        i {
          color: rgb(255, 128, 0);
          margin-left: 2px;
        }
        .topping {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          background-color: #ff8000;
          color: white;
          padding: 1px 3px;
          border-radius: 4px;
          margin-left: 2px;
          cursor: pointer;
        }
      }

      > div:nth-child(2) {
        color: rgba(0, 0, 0, 0.5);
        font-size: 11px;
      }

      > div:last-child {
        display: none;
        color: rgba(0, 0, 0, 0.5);
        font-size: 12px;

        i {
          margin-left: 5px;
        }
      }
    }

    .content {
      display: flex;
      flex-direction: column;
      background-color: rgba(255, 255, 255, 0.6);
      padding: 5px 10px;
      cursor: pointer;
      user-select: text;
      > p {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        word-wrap: anywhere;
        overflow: hidden;
        &:has(+ div) {
          -webkit-line-clamp: 2;
          margin-bottom: 5px;
          font-size: 14px;
        }
      }

      > div {
        display: flex;
        justify-content: center;
        > img {
          object-fit: scale-down;
          max-height: 100px;
          max-width: 100%;
          min-height: 50px;
        }
      }
    }

    .footer {
      display: flex;
      align-items: start;
      justify-content: space-between;
      background-color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      color: rgba(0, 0, 0, 0.5);
      padding: 0 10px;
      height: 16px;

      i {
        cursor: pointer;
        opacity: 0;
      }
    }
  }
}

#details {
  height: 0;
  width: 0;
  overflow: hidden;
}

.color {
  display: flex;
  justify-content: space-between;
  > div {
    border: 2px solid white;
    padding: 1.5px;
    background-clip: content-box;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex-shrink: 0;
  }
}

#total {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
</style>
