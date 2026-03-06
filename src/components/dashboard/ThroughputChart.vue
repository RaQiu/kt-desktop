<template>
  <div class="throughput-chart" style="height: 300px">
    <div v-if="!serverRunning" class="offline-hint">
      <el-empty description="Server offline — start it to see live metrics" :image-size="80" />
    </div>
    <v-chart v-else :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useServerStore } from '@/stores/server'
import { useConfigStore } from '@/stores/config'
import { storeToRefs } from 'pinia'
import { fetchServerMetrics } from '@/api/server-client'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const serverStore = useServerStore()
const configStore = useConfigStore()
const { running: serverRunning } = storeToRefs(serverStore)

const timestamps = ref<string[]>([])
const prefillData = ref<number[]>([])
const decodeData = ref<number[]>([])

const serverUrl = computed(() => {
  const host = configStore.config?.server?.host === '0.0.0.0' ? 'localhost' : (configStore.config?.server?.host || 'localhost')
  const port = configStore.config?.server?.port || 30000
  return `http://${host}:${port}`
})

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['Prefill', 'Decode'] },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'category', boundaryGap: false, data: timestamps.value },
  yAxis: { type: 'value', name: 'tokens/s' },
  series: [
    { name: 'Prefill', type: 'line', data: prefillData.value, smooth: true, itemStyle: { color: '#409eff' } },
    { name: 'Decode', type: 'line', data: decodeData.value, smooth: true, itemStyle: { color: '#67c23a' } }
  ]
}))

let interval: ReturnType<typeof setInterval> | null = null

async function poll() {
  if (!serverRunning.value) return
  const snapshot = await fetchServerMetrics(serverUrl.value)
  if (!snapshot) return
  timestamps.value.push(snapshot.timestamp)
  prefillData.value.push(snapshot.prefill)
  decodeData.value.push(snapshot.decode)
  if (timestamps.value.length > 30) {
    timestamps.value.shift()
    prefillData.value.shift()
    decodeData.value.shift()
  }
}

watch(serverRunning, (running) => {
  if (running) {
    interval = setInterval(poll, 2000)
  } else {
    if (interval) { clearInterval(interval); interval = null }
    timestamps.value = []
    prefillData.value = []
    decodeData.value = []
  }
}, { immediate: true })

onMounted(() => configStore.load())
onUnmounted(() => { if (interval) clearInterval(interval) })
</script>

<style scoped>
.throughput-chart { position: relative; }
.offline-hint { display: flex; align-items: center; justify-content: center; height: 100%; }
</style>
