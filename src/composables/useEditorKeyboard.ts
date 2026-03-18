import { ref, type Ref } from 'vue'
import type { Node } from '@vue-flow/core'

interface KeyboardOptions {
  nodes: Ref<Node[]>
  selectedNodeId: Ref<string | null>
  showSearch: Ref<boolean>
  searchResults: Ref<any[]>
  selectedResultIndex: Ref<number>
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  openSearch: () => void
  closeSearch: () => void
  selectNextResult: () => void
  selectPrevResult: () => void
  jumpToNode: (id: string) => void
  undo: () => void
  redo: () => void
  recordHistory: () => void
}

export function useEditorKeyboard(options: KeyboardOptions) {
  const {
    nodes,
    selectedNodeId,
    showSearch,
    searchResults,
    selectedResultIndex,
    canUndo,
    canRedo,
    openSearch,
    closeSearch,
    selectNextResult,
    selectPrevResult,
    jumpToNode,
    undo,
    redo,
    recordHistory
  } = options

  const copiedNode = ref<Node | null>(null)

  function copyNode() {
    if (!selectedNodeId.value) return
    const node = nodes.value.find(n => n.id === selectedNodeId.value)
    if (node) {
      copiedNode.value = JSON.parse(JSON.stringify(node))
      console.log('📋 Copied node:', node.data.label)
    }
  }

  function pasteNode() {
    if (!copiedNode.value) return
    const newNode: Node = {
      id: `${copiedNode.value.data.nodeType}-${Date.now()}`,
      type: copiedNode.value.type,
      position: {
        x: copiedNode.value.position.x + 50,
        y: copiedNode.value.position.y + 50,
      },
      dragHandle: '.node-header',
      data: JSON.parse(JSON.stringify(copiedNode.value.data)),
    }
    nodes.value.push(newNode)
    selectedNodeId.value = newNode.id
    console.log('📌 Pasted node:', newNode.data.label)
    recordHistory()
  }

  function toggleNodeDisabled() {
    if (!selectedNodeId.value) return
    const node = nodes.value.find(n => n.id === selectedNodeId.value)
    if (!node) return
    node.data.disabled = !node.data.disabled
    const status = node.data.disabled ? '🚫 已停用' : '✅ 已啟用'
    console.log(`${status}: ${node.data.label}`)
  }

  function showUndoRedoToast(message: string) {
    const toast = document.createElement('div')
    toast.textContent = message
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg-elevated);color:var(--text-primary);padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.2s ease;border:1px solid var(--border);'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 1000)
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const isSearchInput = target.classList.contains('search-input')

    if (showSearch.value && e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
      return
    }

    if (showSearch.value && isSearchInput) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectNextResult()
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectPrevResult()
        return
      } else if (e.key === 'Enter' && searchResults.value.length > 0) {
        e.preventDefault()
        const selectedNode = searchResults.value[selectedResultIndex.value]
        if (selectedNode) {
          jumpToNode(selectedNode.id)
          closeSearch()
        }
        return
      }
      return
    }

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    if (e.key === '/') {
      e.preventDefault()
      openSearch()
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

    if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (canUndo.value) {
        undo()
        showUndoRedoToast('↩️ 復原')
      }
      return
    }

    if ((ctrlOrCmd && e.shiftKey && e.key === 'z') || (ctrlOrCmd && e.key === 'y')) {
      e.preventDefault()
      if (canRedo.value) {
        redo()
        showUndoRedoToast('↪️ 重做')
      }
      return
    }

    if (ctrlOrCmd && e.key === 'c') {
      e.preventDefault()
      copyNode()
    } else if (ctrlOrCmd && e.key === 'v') {
      e.preventDefault()
      pasteNode()
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault()
      toggleNodeDisabled()
    }
  }

  function setupKeyboard() {
    window.addEventListener('keydown', handleKeydown)
  }

  function teardownKeyboard() {
    window.removeEventListener('keydown', handleKeydown)
  }

  return {
    copiedNode,
    copyNode,
    pasteNode,
    toggleNodeDisabled,
    showUndoRedoToast,
    setupKeyboard,
    teardownKeyboard
  }
}
