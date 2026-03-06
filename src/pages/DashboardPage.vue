<template>
  <div class="dashboard">
    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="24">
        <el-card class="quick-actions">
          <div class="status-row">
            <div class="status-indicator">
              <el-tag :type="serverRunning ? 'success' : 'info'" size="large">
                {{ serverRunning ? t('common.running') : t('common.stopped') }}
              </el-tag>
              <span class="model-name">{{ currentModel || 'No model loaded' }}</span>
            </div>
            <el-button v-if="!serverRunning" type="primary" size="large" @click="quickStart">
              Start Server
            </el-button>
            <el-button v-else type="danger" size="large" @click="quickStop">
              Stop Server
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="8">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>{{ t('dashboard.gpu') }}</span>
            </div>
          </template>
          <div v-if="metrics.gpu?.length">
            <div v-for="(gpu, i) in metrics.gpu" :key="i" class="gpu-item">
              <div class="gpu-name">{{ info.gpu?.[i]?.name || `GPU ${i}` }}</div>
              <GaugeChart :value="gpu.utilization" :size="180" />
              <div class="metrics">
                <div>VRAM: {{ gpu.memoryUsed }}/{{ gpu.memoryTotal }} MB</div>
                <div>Temp: {{ gpu.temperature }}°C</div>
              </div>
            </div>
          </div>
          <el-empty v-else description="No GPU detected" />
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header>{{ t('dashboard.cpu') }}</template>
          <div class="cpu-info">
            <div class="info-item">
              <span>Model:</span>
              <span>{{ info.cpu?.model || 'Unknown' }}</span>
            </div>
            <div class="info-item">
              <span>Cores:</span>
              <span>{{ info.cpu?.cores || 0 }}</span>
            </div>
            <GaugeChart :value="metrics.cpu?.usage || 0" :size="180" />
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header>{{ t('dashboard.memory') }}</template>
          <div class="memory-info">
            <GaugeChart
              :value="memoryUsagePercent"
              :size="180"
              unit="%"
            />
            <div class="metrics">
              <div>Used: {{ formatBytes(metrics.memory?.used) }}</div>
              <div>Total: {{ formatBytes(metrics.memory?.total) }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card>
          <template #header>{{ t('dashboard.throughput') }}</template>
          <ThroughputChart />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>Model Information</template>
          <div v-if="currentModel" class="info-list">
            <div class="info-item"><span>Name:</span><span>{{ currentModel }}</span></div>
            <div class="info-item"><span>Format:</span><span>{{ modelFormat }}</span></div>
            <div class="info-item"><span>MoE:</span><span>{{ isMoE ? 'Yes' : 'No' }}</span></div>
          </div>
          <el-empty v-else description="No model loaded" />
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>System Overview</template>
          <div class="info-list">
            <div class="info-item"><span>OS:</span><span>{{ systemOS }}</span></div>
            <div class="info-item"><span>Python:</span><span>{{ versionInfo.pythonVersion || '—' }}</span></div>
            <div class="info-item"><span>CUDA:</span><span>{{ versionInfo.cudaVersion || '—' }}</span></div>
            <div class="info-item">
              <span>kt-kernel:</span>
              <span>
                {{ versionInfo.ktKernelVersion || '—' }}
                <el-tag v-if="versionInfo.cpuVariant" size="small" style="margin-left: 4px">{{ versionInfo.cpuVariant }}</el-tag>
              </span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'
import { useServerStore } from '@/stores/server'
import { storeToRefs } from 'pinia'
import GaugeChart from '@/components/shared/GaugeChart.vue'
import ThroughputChart from '@/components/dashboard/ThroughputChart.vue'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const systemStore = useSystemStore()
const serverStore = useServerStore()
const { info, metrics } = storeToRefs(systemStore)
const { running: serverRunning } = storeToRefs(serverStore)

const currentModel = ref('')
const modelFormat = ref('')
const isMoE = ref(false)
const systemOS = ref(navigator.platform || 'Unknown')
const versionInfo = ref<{ ktKernelVersion?: string; cpuVariant?: string; pythonVersion?: string; cudaVersion?: string }>({})

async function loadVersionInfo() {
  const result = await window.electronAPI.version.get()
  if (result.success) versionInfo.value = result
}
const cudaVersion = ref('')  // now populated via versionInfo

const memoryUsagePercent = computed(() => {
  if (!metrics.value.memory?.used || !metrics.value.memory?.total) return 0
  return Math.round((metrics.value.memory.used / metrics.value.memory.total) * 100)
})

let interval: any

onMounted(async () => {
  await systemStore.loadInfo()
  await systemStore.loadMetrics()
  loadVersionInfo()
  interval = setInterval(() => systemStore.loadMetrics(), 2000)
})

onUnmounted(() => clearInterval(interval))

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const gb = bytes / 1024 / 1024 / 1024
  return `${gb.toFixed(2)} GB`
}

async function quickStart() {
  router.push('/service')
}

async function quickStop() {
  const result = await serverStore.stop()
  if (result.success) ElMessage.success('Server stopped')
}
</script>

<style scoped>
.dashboard {
  padding: 20px;
}
.quick-actions {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.status-indicator {
  display: flex;
  align-items: center;
  gap: 20px;
}
.model-name {
  font-size: 18px;
  font-weight: 500;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gpu-item, .cpu-info, .memory-info {
  text-align: center;
}
.gpu-name {
  font-weight: 500;
  margin-bottom: 10px;
}
.metrics {
  margin-top: 10px;
  font-size: 14px;
}
.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.info-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.info-item span:first-child {
  color: #909399;
}
</style>
