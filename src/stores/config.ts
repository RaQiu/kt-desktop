import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfigStore = defineStore('config', () => {
  const config = ref<any>({})
  const dirty = ref(false)

  async function load() {
    config.value = await window.electronAPI.config.getAll()
    dirty.value = false
  }

  async function save() {
    for (const key in config.value) {
      await window.electronAPI.config.set(key, config.value[key])
    }
    dirty.value = false
  }

  async function reset() {
    await window.electronAPI.config.reset()
    await load()
  }

  function update(key: string, value: any) {
    const parts = key.split('.')
    let obj = config.value
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {}
      obj = obj[parts[i]]
    }
    obj[parts[parts.length - 1]] = value
    dirty.value = true
  }

  return { config, dirty, load, save, reset, update }
})
