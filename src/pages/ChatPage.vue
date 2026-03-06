<template>
  <div class="chat-page">
    <div class="chat-header">
      <span>Chat with Model</span>
      <div class="header-controls">
        <el-select v-model="selectedModel" placeholder="Select model" size="small" style="width: 200px; margin-right: 8px">
          <el-option v-for="m in models" :key="m.name" :label="m.name" :value="m.name" />
        </el-select>
        <el-button size="small" @click="clearChat">Clear</el-button>
      </div>
    </div>

    <el-alert v-if="!serverRunning" title="Server is not running. Start it from the Service page." type="warning" show-icon style="margin: 10px 20px" />

    <div class="messages" ref="messagesEl">
      <div v-if="messages.length === 0" class="empty-hint">
        Send a message to start chatting
      </div>
      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
        <div class="role">{{ msg.role === 'user' ? 'You' : 'Assistant' }}</div>
        <div class="content" v-html="renderContent(msg.content)" />
      </div>
      <div v-if="streaming" class="message assistant">
        <div class="role">Assistant</div>
        <div class="content" v-html="renderContent(streamBuffer)" />
        <span class="cursor">▋</span>
      </div>
    </div>

    <div class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        @keydown.enter.exact.prevent="sendMessage"
        :disabled="streaming || !serverRunning"
      />
      <div class="input-actions">
        <el-popover trigger="click" width="400">
          <template #reference>
            <el-button size="small">System Prompt</el-button>
          </template>
          <el-input v-model="systemPrompt" type="textarea" :rows="4" placeholder="Optional system prompt" />
        </el-popover>
        <el-button
          type="primary"
          @click="sendMessage"
          :disabled="!inputText.trim() || streaming || !serverRunning"
          :loading="streaming"
        >
          Send
        </el-button>
        <el-button v-if="streaming" type="warning" @click="stopStream">Stop</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useServerStore } from '@/stores/server'
import { useModelsStore } from '@/stores/models'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'

const serverStore = useServerStore()
const modelsStore = useModelsStore()
const configStore = useConfigStore()
const { running: serverRunning } = storeToRefs(serverStore)
const { models } = storeToRefs(modelsStore)

const messages = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const inputText = ref('')
const systemPrompt = ref('')
const streaming = ref(false)
const streamBuffer = ref('')
const selectedModel = ref('')
const messagesEl = ref<HTMLElement>()

let abortController: AbortController | null = null

const serverPort = computed(() => configStore.config?.server?.port || 30000)
const serverHost = computed(() => configStore.config?.server?.host || '0.0.0.0')
const serverUrl = computed(() => {
  const host = serverHost.value === '0.0.0.0' ? 'localhost' : serverHost.value
  return `http://${host}:${serverPort.value}`
})

onMounted(() => {
  modelsStore.load()
  configStore.load()
  serverStore.checkStatus()
})

function renderContent(text: string): string {
  // Basic escaping + code block highlighting
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  streamBuffer.value = ''
  streaming.value = true

  await scrollToBottom()

  const chatMessages = []
  if (systemPrompt.value) {
    chatMessages.push({ role: 'system', content: systemPrompt.value })
  }
  chatMessages.push(...messages.value)

  try {
    abortController = new AbortController()
    const response = await fetch(`${serverUrl.value}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel.value || 'default',
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      }),
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            streamBuffer.value += delta
            await scrollToBottom()
          }
        } catch {}
      }
    }

    messages.value.push({ role: 'assistant', content: streamBuffer.value })
    streamBuffer.value = ''
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      messages.value.push({ role: 'assistant', content: `Error: ${e.message}` })
    }
  } finally {
    streaming.value = false
    abortController = null
    await scrollToBottom()
  }
}

function stopStream() {
  abortController?.abort()
  if (streamBuffer.value) {
    messages.value.push({ role: 'assistant', content: streamBuffer.value + ' [stopped]' })
  }
  streaming.value = false
  streamBuffer.value = ''
}

function clearChat() {
  messages.value = []
  streamBuffer.value = ''
}

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  padding: 0;
}
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
  font-size: 16px;
  font-weight: 500;
}
.header-controls { display: flex; align-items: center; }
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.empty-hint {
  color: #909399;
  text-align: center;
  margin-top: 40px;
}
.message {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 8px;
}
.message.user {
  align-self: flex-end;
  background: #409eff;
  color: white;
}
.message.assistant {
  align-self: flex-start;
  background: #f5f7fa;
  color: #303133;
}
.role {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  opacity: 0.7;
}
.content :deep(pre) {
  background: rgba(0,0,0,0.1);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 4px 0;
}
.content :deep(code) {
  font-family: monospace;
  font-size: 13px;
}
.cursor {
  animation: blink 1s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
.input-area {
  padding: 16px 20px;
  border-top: 1px solid #e8e8e8;
}
.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
