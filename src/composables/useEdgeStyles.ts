import { watch, ref, type Ref } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

export function useEdgeStyles(
  nodes: Ref<Node[]>,
  edges: Ref<Edge[]>,
  selectedNodeId: Ref<string | null>,
  selectedEdgeId: Ref<string | null>,
  selectedNodes: Ref<Node[]>,
  runningNodeId: Ref<string | null | undefined>
) {
  // Track which edge is hovered for hover-highlight feature
  const hoveredEdgeId = ref<string | null>(null)

  function onEdgeMouseEnter(edge: Edge) {
    hoveredEdgeId.value = edge.id
  }

  function onEdgeMouseLeave() {
    hoveredEdgeId.value = null
  }

  // Apply styles directly to edges in-place (mutate) so v-model:edges works
  function applyEdgeStyles() {
    const multiSelectedIds = new Set(selectedNodes.value.map(n => n.id))
    const currentRunningId = runningNodeId.value

    for (const edge of edges.value) {
      const sourceNode = nodes.value.find(n => n.id === edge.source)
      const targetNode = nodes.value.find(n => n.id === edge.target)
      const isDisabledEdge = sourceNode?.data.disabled || targetNode?.data.disabled
      const isSelectedEdge = edge.id === selectedEdgeId.value
      const isHoveredEdge = edge.id === hoveredEdgeId.value
      const isConnectedToSelected = selectedNodeId.value &&
        (edge.source === selectedNodeId.value || edge.target === selectedNodeId.value)
      const isMultiSelectedEdge = multiSelectedIds.size >= 2 &&
        multiSelectedIds.has(edge.source) && multiSelectedIds.has(edge.target)
      const isDownstreamOfExecuting = currentRunningId && edge.source === currentRunningId

      let edgeClass = ''
      let animated = false

      if (isDisabledEdge) {
        edgeClass = 'edge-dimmed'
      } else if (currentRunningId) {
        if (isDownstreamOfExecuting) {
          edgeClass = 'edge-executing edge-flow-animated'
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

      if (isHoveredEdge && !isDisabledEdge && edgeClass !== 'edge-dimmed') {
        edgeClass = (edgeClass ? edgeClass + ' ' : '') + 'edge-hovered'
      }

      edge.class = edgeClass
      edge.animated = animated
    }
  }

  // Watch all relevant dependencies and apply styles
  watch(
    [edges, selectedNodeId, selectedEdgeId, selectedNodes, runningNodeId, hoveredEdgeId],
    applyEdgeStyles,
    { deep: true, immediate: true }
  )

  return { onEdgeMouseEnter, onEdgeMouseLeave }
}
