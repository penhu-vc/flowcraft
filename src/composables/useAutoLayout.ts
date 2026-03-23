import dagre from 'dagre'
import type { Node, Edge } from '@vue-flow/core'

export function useAutoLayout() {
  function autoLayout(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'LR' = 'LR'
  ): Node[] {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({
      rankdir: direction,
      nodesep: 80,
      ranksep: 120,
    })

    // Add nodes to graph
    nodes.forEach(node => {
      g.setNode(node.id, {
        width: node.dimensions?.width || 220,
        height: node.dimensions?.height || 100,
      })
    })

    // Add edges to graph
    edges.forEach(edge => {
      g.setEdge(edge.source, edge.target)
    })

    // Calculate layout
    dagre.layout(g)

    // Update node positions
    const layoutedNodes = nodes.map(node => {
      const position = g.node(node.id)
      return {
        ...node,
        position: {
          x: position.x - (node.dimensions?.width || 220) / 2,
          y: position.y - (node.dimensions?.height || 100) / 2,
        },
      }
    })

    return layoutedNodes
  }

  return { autoLayout }
}
