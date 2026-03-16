import { ref, computed } from 'vue'
import type { Node } from '@vue-flow/core'
import { useVueFlow } from '@vue-flow/core'

export function useNodeSearch(nodes: { value: Node[] }) {
  const { fitView } = useVueFlow()
  const searchQuery = ref('')
  const showSearch = ref(false)
  const selectedResultIndex = ref(0)

  const searchResults = computed(() => {
    if (!searchQuery.value) return []

    const query = searchQuery.value.toLowerCase()
    return nodes.value.filter(node => {
      const matchName = node.data.label?.toLowerCase().includes(query)
      const matchType = node.data.nodeType?.toLowerCase().includes(query)
      const matchConfig = JSON.stringify(node.data.config || {})
        .toLowerCase()
        .includes(query)
      return matchName || matchType || matchConfig
    })
  })

  function openSearch() {
    showSearch.value = true
    searchQuery.value = ''
    selectedResultIndex.value = 0
  }

  function closeSearch() {
    showSearch.value = false
    searchQuery.value = ''
    selectedResultIndex.value = 0
    // Clear highlights
    nodes.value.forEach(node => {
      if (node.data) {
        node.data.highlighted = false
      }
    })
  }

  function jumpToNode(nodeId: string) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      fitView({ nodes: [node], duration: 500, padding: 0.3 })
      // Highlight node
      nodes.value.forEach(n => {
        if (n.data) {
          n.data.highlighted = n.id === nodeId
        }
      })
    }
  }

  function selectNextResult() {
    if (searchResults.value.length === 0) return
    selectedResultIndex.value = (selectedResultIndex.value + 1) % searchResults.value.length
    const selectedNode = searchResults.value[selectedResultIndex.value]
    if (selectedNode) {
      jumpToNode(selectedNode.id)
    }
  }

  function selectPrevResult() {
    if (searchResults.value.length === 0) return
    selectedResultIndex.value =
      (selectedResultIndex.value - 1 + searchResults.value.length) % searchResults.value.length
    const selectedNode = searchResults.value[selectedResultIndex.value]
    if (selectedNode) {
      jumpToNode(selectedNode.id)
    }
  }

  return {
    searchQuery,
    showSearch,
    searchResults,
    selectedResultIndex,
    openSearch,
    closeSearch,
    jumpToNode,
    selectNextResult,
    selectPrevResult,
  }
}
