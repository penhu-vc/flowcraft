import { computed, type Ref } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

export function useEdgeStyles(
  nodes: Ref<Node[]>,
  edges: Ref<Edge[]>,
  selectedNodeId: Ref<string | null>,
  selectedEdgeId: Ref<string | null>,
  selectedNodes: Ref<Node[]>,
  runningNodeId: Ref<string | null | undefined>
) {
  const styledEdges = computed(() => {
    return edges.value.map(edge => {
      const sourceNode = nodes.value.find(n => n.id === edge.source)
      const targetNode = nodes.value.find(n => n.id === edge.target)
      const isDisabledEdge = sourceNode?.data.disabled || targetNode?.data.disabled
      const isSelectedEdge = edge.id === selectedEdgeId.value
      const isConnectedToSelected = selectedNodeId.value &&
        (edge.source === selectedNodeId.value || edge.target === selectedNodeId.value)
      const multiSelectedIds = new Set(selectedNodes.value.map(n => n.id))
      const isMultiSelectedEdge = multiSelectedIds.size >= 2 &&
        multiSelectedIds.has(edge.source) && multiSelectedIds.has(edge.target)
      const currentRunningId = runningNodeId.value
      const isDownstreamOfExecuting = currentRunningId && edge.source === currentRunningId

      let edgeClass = ''
      let animated = false

      if (isDisabledEdge) {
        edgeClass = 'edge-dimmed'
      } else if (currentRunningId) {
        if (isDownstreamOfExecuting) {
          edgeClass = 'edge-executing'
          animated = true
        } else {
          edgeClass = 'edge-dimmed'
        }
      } else if (selectedEdgeId.value) {
        edgeClass = isSelectedEdge ? 'edge-highlighted' : 'edge-dimmed'
        animated = isSelectedEdge
      } else if (multiSelectedIds.size >= 2) {
        edgeClass = isMultiSelectedEdge ? 'edge-highlighted' : 'edge-dimmed'
        animated = isMultiSelectedEdge
      } else if (selectedNodeId.value) {
        edgeClass = isConnectedToSelected ? 'edge-highlighted' : 'edge-dimmed'
        animated = isConnectedToSelected
      }

      return { ...edge, class: edgeClass, animated }
    })
  })

  return { styledEdges }
}
