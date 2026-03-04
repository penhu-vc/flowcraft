import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DataRecord {
  id: string
  timestamp: string
  workflowId?: string
  nodeId?: string
  data: any
}

export interface DataCollection {
  id: string
  name: string
  description: string
  schema?: string  // JSON schema (optional)
  records: DataRecord[]
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'flowcraft_collections'

function loadFromStorage(): DataCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(collections: DataCollection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections))
}

export const useCollectionStore = defineStore('collection', () => {
  const collections = ref<DataCollection[]>(loadFromStorage())

  function createCollection(name: string, description = '', schema = '') {
    const collection: DataCollection = {
      id: `col-${Date.now()}`,
      name,
      description,
      schema,
      records: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    collections.value.unshift(collection)
    saveToStorage(collections.value)
    return collection
  }

  function deleteCollection(id: string) {
    collections.value = collections.value.filter(c => c.id !== id)
    saveToStorage(collections.value)
  }

  function getCollection(id: string) {
    return collections.value.find(c => c.id === id) || null
  }

  function appendRecord(collectionId: string, data: any, workflowId?: string, nodeId?: string) {
    const collection = getCollection(collectionId)
    if (!collection) return false

    const record: DataRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      workflowId,
      nodeId,
      data,
    }

    collection.records.push(record)
    collection.updatedAt = new Date().toISOString()
    saveToStorage(collections.value)
    return true
  }

  function deleteRecord(collectionId: string, recordId: string) {
    const collection = getCollection(collectionId)
    if (!collection) return false

    collection.records = collection.records.filter(r => r.id !== recordId)
    collection.updatedAt = new Date().toISOString()
    saveToStorage(collections.value)
    return true
  }

  function clearRecords(collectionId: string) {
    const collection = getCollection(collectionId)
    if (!collection) return false

    collection.records = []
    collection.updatedAt = new Date().toISOString()
    saveToStorage(collections.value)
    return true
  }

  function exportCollection(id: string) {
    const collection = getCollection(id)
    if (!collection) return

    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${collection.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportRecordsOnly(id: string) {
    const collection = getCollection(id)
    if (!collection) return

    const data = collection.records.map(r => r.data)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${collection.name.replace(/\s+/g, '_')}_data_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    collections,
    createCollection,
    deleteCollection,
    getCollection,
    appendRecord,
    deleteRecord,
    clearRecords,
    exportCollection,
    exportRecordsOnly,
  }
})
