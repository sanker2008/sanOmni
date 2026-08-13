import { convertFileSrc } from '@tauri-apps/api/core';
import type { CanvasNodeDef, CanvasEdgeDef, WorkflowIO, ExecutionProgress, ExecutionResult, NodeProgress } from './types';
import { getAdapter } from './adapters';
import { getStepDir, ensureDir } from './fs';

export class WorkflowEngine {
  private abortController: AbortController | null = null;

  /**
   * Topological sort of DAG nodes based on edges.
   */
  topologicalSort(nodes: CanvasNodeDef[], edges: CanvasEdgeDef[]): CanvasNodeDef[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      graph.set(node.id, []);
    }

    for (const edge of edges) {
      if (nodeMap.has(edge.sourceNodeId) && nodeMap.has(edge.targetNodeId)) {
        graph.get(edge.sourceNodeId)!.push(edge.targetNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sorted: CanvasNodeDef[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      if (nodeMap.has(u)) sorted.push(nodeMap.get(u)!);

      for (const v of graph.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    // If cycle exists, append unvisited nodes at the end
    if (sorted.length < nodes.length) {
      for (const node of nodes) {
        if (!sorted.includes(node)) sorted.push(node);
      }
    }

    return sorted;
  }

  /**
   * Execute the graph pipeline.
   */
  async execute(
    nodes: CanvasNodeDef[],
    edges: CanvasEdgeDef[],
    executionId: string,
    onProgress: (progress: ExecutionProgress) => void
  ): Promise<ExecutionResult> {
    this.abortController = new AbortController();
    const startTime = performance.now();
    const sortedNodes = this.topologicalSort(nodes, edges);

    const nodeResults: Record<string, NodeProgress> = {};
    for (const node of nodes) {
      const adapter = getAdapter(node.adapterId);
      nodeResults[node.id] = {
        nodeId: node.id,
        adapterName: adapter?.name || (node.type === 'input' ? '图片输入' : node.adapterId),
        status: 'idle',
      };
    }

    const outputMap = new Map<string, string[]>(); // nodeId -> outputPaths

    const emitProgress = (status: ExecutionProgress['status'], currentNodeId: string, error?: string) => {
      const completedCount = Object.values(nodeResults).filter(n => n.status === 'completed').length;
      onProgress({
        executionId,
        currentNodeId,
        totalNodes: nodes.length,
        completedNodes: completedCount,
        nodeProgress: { ...nodeResults },
        status,
        error,
      });
    };

    try {
      emitProgress('running', sortedNodes[0]?.id || '');

      for (let i = 0; i < sortedNodes.length; i++) {
        if (this.abortController.signal.aborted) {
          emitProgress('aborted', sortedNodes[i].id);
          return {
            success: false,
            executionId,
            nodeResults,
            finalOutputPaths: [],
            totalDurationMs: performance.now() - startTime,
            error: '用户取消了执行。',
          };
        }

        const node = sortedNodes[i];

        // Gather input paths from incoming edges
        const incomingEdges = edges.filter(e => e.targetNodeId === node.id);
        let inputPaths: string[] = [];

        if (incomingEdges.length > 0) {
          for (const edge of incomingEdges) {
            const srcOutputs = outputMap.get(edge.sourceNodeId) || [];
            inputPaths.push(...srcOutputs);
          }
        } else if (node.inputPaths && node.inputPaths.length > 0) {
          // Root node with direct input files
          inputPaths = node.inputPaths;
        }

        // If it's a dedicated 'input' node type
        if (node.type === 'input' || node.adapterId === 'input-image') {
          nodeResults[node.id].status = 'completed';
          nodeResults[node.id].outputPaths = inputPaths;
          if (inputPaths.length > 0) {
            nodeResults[node.id].outputPreview = convertFileSrc(inputPaths[0]);
          }
          outputMap.set(node.id, inputPaths);
          emitProgress('running', node.id);
          continue;
        }

        const adapter = getAdapter(node.adapterId);
        if (!adapter) {
          nodeResults[node.id].status = 'error';
          nodeResults[node.id].error = `未知的适配器: ${node.adapterId}`;
          emitProgress('error', node.id, nodeResults[node.id].error);
          throw new Error(nodeResults[node.id].error);
        }

        // Skip execution if no input files provided
        if (inputPaths.length === 0) {
          nodeResults[node.id].status = 'completed';
          outputMap.set(node.id, []);
          emitProgress('running', node.id);
          continue;
        }

        // Prepare step output directory
        const stepDir = await getStepDir(executionId, i);
        await ensureDir(stepDir);

        nodeResults[node.id].status = 'processing';
        emitProgress('running', node.id);
        const nodeStart = performance.now();

        try {
          const currentIO: WorkflowIO = { paths: inputPaths };
          const mergedConfig = { ...getDefaultConfig(adapter), ...node.config, __outputDir: stepDir };

          const output = await adapter.process(currentIO, mergedConfig);
          const duration = performance.now() - nodeStart;

          nodeResults[node.id].status = 'completed';
          nodeResults[node.id].durationMs = Math.round(duration);
          nodeResults[node.id].outputPaths = output.paths;

          if (output.paths.length > 0) {
            nodeResults[node.id].outputPreview = convertFileSrc(output.paths[0]);
          }

          outputMap.set(node.id, output.paths);
          emitProgress('running', node.id);
        } catch (err: any) {
          const duration = performance.now() - nodeStart;
          nodeResults[node.id].status = 'error';
          nodeResults[node.id].durationMs = Math.round(duration);
          nodeResults[node.id].error = err?.message || String(err);
          emitProgress('error', node.id, nodeResults[node.id].error);
          throw err;
        }
      }

      // Collect final leaf node outputs
      const leafNodes = sortedNodes.filter(n => !edges.some(e => e.sourceNodeId === n.id));
      const finalOutputs: string[] = [];
      for (const leaf of leafNodes) {
        finalOutputs.push(...(outputMap.get(leaf.id) || []));
      }

      emitProgress('completed', sortedNodes[sortedNodes.length - 1]?.id || '');
      return {
        success: true,
        executionId,
        nodeResults,
        finalOutputPaths: Array.from(new Set(finalOutputs)),
        totalDurationMs: Math.round(performance.now() - startTime),
      };
    } catch (err: any) {
      return {
        success: false,
        executionId,
        nodeResults,
        finalOutputPaths: [],
        totalDurationMs: Math.round(performance.now() - startTime),
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Execute a single node in the graph.
   */
  async executeSingleNode(
    targetNodeId: string,
    nodes: CanvasNodeDef[],
    edges: CanvasEdgeDef[],
    executionId: string,
    onProgress: (progress: ExecutionProgress) => void
  ): Promise<ExecutionResult> {
    this.abortController = new AbortController();
    const startTime = performance.now();
    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (!targetNode) {
      throw new Error(`找不到节点: ${targetNodeId}`);
    }

    // Determine input paths for this single node
    const incomingEdges = edges.filter(e => e.targetNodeId === targetNodeId);
    let inputPaths: string[] = [];

    if (incomingEdges.length > 0) {
      for (const edge of incomingEdges) {
        const srcNode = nodes.find(n => n.id === edge.sourceNodeId);
        if (srcNode && srcNode.outputPaths && srcNode.outputPaths.length > 0) {
          inputPaths.push(...srcNode.outputPaths);
        } else if (srcNode && srcNode.inputPaths && srcNode.inputPaths.length > 0) {
          inputPaths.push(...srcNode.inputPaths);
        }
      }
    } else if (targetNode.inputPaths && targetNode.inputPaths.length > 0) {
      inputPaths = targetNode.inputPaths;
    }

    const adapter = getAdapter(targetNode.adapterId);
    const adapterName = adapter?.name || (targetNode.type === 'input' ? '图片输入' : targetNode.adapterId);

    const nodeResults: Record<string, NodeProgress> = {
      [targetNodeId]: {
        nodeId: targetNodeId,
        adapterName,
        status: 'processing',
      },
    };

    onProgress({
      executionId,
      currentNodeId: targetNodeId,
      totalNodes: 1,
      completedNodes: 0,
      nodeProgress: nodeResults,
      status: 'running',
    });

    try {
      if (targetNode.type === 'input' || targetNode.adapterId === 'input-image') {
        nodeResults[targetNodeId].status = 'completed';
        nodeResults[targetNodeId].outputPaths = inputPaths;
        if (inputPaths.length > 0) {
          nodeResults[targetNodeId].outputPreview = convertFileSrc(inputPaths[0]);
        }
        onProgress({
          executionId,
          currentNodeId: targetNodeId,
          totalNodes: 1,
          completedNodes: 1,
          nodeProgress: nodeResults,
          status: 'completed',
        });
        return {
          success: true,
          executionId,
          nodeResults,
          finalOutputPaths: inputPaths,
          totalDurationMs: Math.round(performance.now() - startTime),
        };
      }

      if (!adapter) {
        throw new Error(`未知的适配器: ${targetNode.adapterId}`);
      }

      if (inputPaths.length === 0) {
        throw new Error(`节点 "${adapterName}" 缺乏输入图片。请先选择图片或先运行上游节点。`);
      }

      const stepDir = await getStepDir(executionId, 0);
      await ensureDir(stepDir);

      const nodeStart = performance.now();
      const currentIO: WorkflowIO = { paths: inputPaths };
      const mergedConfig = { ...getDefaultConfig(adapter), ...targetNode.config, __outputDir: stepDir };

      const output = await adapter.process(currentIO, mergedConfig);
      const duration = performance.now() - nodeStart;

      nodeResults[targetNodeId].status = 'completed';
      nodeResults[targetNodeId].durationMs = Math.round(duration);
      nodeResults[targetNodeId].outputPaths = output.paths;

      if (output.paths.length > 0) {
        nodeResults[targetNodeId].outputPreview = convertFileSrc(output.paths[0]);
      }

      onProgress({
        executionId,
        currentNodeId: targetNodeId,
        totalNodes: 1,
        completedNodes: 1,
        nodeProgress: nodeResults,
        status: 'completed',
      });

      return {
        success: true,
        executionId,
        nodeResults,
        finalOutputPaths: output.paths,
        totalDurationMs: Math.round(performance.now() - startTime),
      };
    } catch (err: any) {
      const duration = performance.now() - startTime;
      nodeResults[targetNodeId].status = 'error';
      nodeResults[targetNodeId].durationMs = Math.round(duration);
      nodeResults[targetNodeId].error = err?.message || String(err);

      onProgress({
        executionId,
        currentNodeId: targetNodeId,
        totalNodes: 1,
        completedNodes: 0,
        nodeProgress: nodeResults,
        status: 'error',
        error: nodeResults[targetNodeId].error,
      });

      return {
        success: false,
        executionId,
        nodeResults,
        finalOutputPaths: [],
        totalDurationMs: Math.round(duration),
        error: nodeResults[targetNodeId].error,
      };
    }
  }

  abort(): void {
    this.abortController?.abort();
  }
}

function getDefaultConfig(adapter: { configSchema: { key: string; defaultValue: any }[] }): Record<string, any> {
  const config: Record<string, any> = {};
  for (const field of adapter.configSchema) {
    config[field.key] = field.defaultValue;
  }
  return config;
}
