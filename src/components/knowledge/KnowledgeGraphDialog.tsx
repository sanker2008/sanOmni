import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { FileText, FolderKanban, Globe2, Loader2, Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  knowledgeApi,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  type KnowledgeGraphResult,
  type KnowledgeProject,
} from "@/services/tauri";

const GRAPH_WIDTH = 1040;
const GRAPH_HEIGHT = 700;

type NodePosition = { x: number; y: number };

function nodeLabel(node: KnowledgeGraphNode) {
  if (node.node_type === "project") return "项目";
  if (node.node_type === "collection") return "网页文档集";
  return node.entry_type ?? "知识条目";
}

function shorten(value: string, limit = 18) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function layoutGraph(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]) {
  const positions = new Map<string, NodePosition>();
  const project = nodes.find((node) => node.node_type === "project");
  if (!project) return positions;

  const center = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };
  positions.set(project.id, center);

  const collections = nodes.filter((node) => node.node_type === "collection");
  const collectionRadius = Math.min(180, 70 + collections.length * 20);
  collections.forEach((collection, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(collections.length, 1);
    positions.set(collection.id, {
      x: center.x + Math.cos(angle) * collectionRadius,
      y: center.y + Math.sin(angle) * collectionRadius,
    });
  });

  const parentByEntry = new Map(
    edges
      .filter((edge) => edge.target.startsWith("entry:"))
      .map((edge) => [edge.target, edge.source]),
  );
  const entriesByParent = new Map<string, KnowledgeGraphNode[]>();
  nodes
    .filter((node) => node.node_type === "entry")
    .forEach((entry) => {
      const parent = parentByEntry.get(entry.id) ?? project.id;
      const group = entriesByParent.get(parent) ?? [];
      group.push(entry);
      entriesByParent.set(parent, group);
    });

  const entryGroups = [project.id, ...collections.map((collection) => collection.id)]
    .map((parentId) => ({ parentId, entries: entriesByParent.get(parentId) ?? [] }))
    .filter((group) => group.entries.length > 0);
  const totalEntries = entryGroups.reduce((total, group) => total + group.entries.length, 0);
  const entryRadius = totalEntries > 60 ? 295 : 265;
  let entryOffset = 0;

  entryGroups.forEach((group) => {
    group.entries.forEach((entry, index) => {
      const position = entryOffset + index + 0.5;
      const angle = -Math.PI / 2 + (Math.PI * 2 * position) / totalEntries;
      positions.set(entry.id, {
        x: center.x + Math.cos(angle) * entryRadius,
        y: center.y + Math.sin(angle) * entryRadius,
      });
    });
    entryOffset += group.entries.length;
  });

  return positions;
}

function GraphNodeIcon({ node }: { node: KnowledgeGraphNode }) {
  if (node.node_type === "project") return <FolderKanban className="h-4 w-4" />;
  if (node.node_type === "collection") return <Globe2 className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function GraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: KnowledgeGraphResult;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const positions = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const hasFewEntries = graph.nodes.filter((node) => node.node_type === "entry").length <= 20;

  const handleNodeKeyDown = (event: KeyboardEvent<SVGGElement>, nodeId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNode(nodeId);
    }
  };

  return (
    <div className="overflow-x-auto border bg-muted/20">
      <svg
        className="min-w-[760px]"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        role="group"
        aria-label="知识条目关系图谱"
      >
        <title>知识条目关系图谱</title>
        <g aria-hidden="true">
          {graph.edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className="stroke-border stroke-[1.5]"
              />
            );
          })}
        </g>
        {graph.nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const selected = node.id === selectedNodeId;
          const radius = node.node_type === "project" ? 27 : node.node_type === "collection" ? 20 : 10;
          const fillClass = node.node_type === "project"
            ? "fill-primary"
            : node.node_type === "collection"
              ? "fill-secondary"
              : "fill-muted-foreground";

          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`选择${nodeLabel(node)}：${node.label}`}
              aria-pressed={selected}
              onClick={() => onSelectNode(node.id)}
              onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
              className="cursor-pointer outline-none"
            >
              <title>{`${nodeLabel(node)}：${node.label}`}</title>
              {selected && (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius + 6}
                  className="fill-none stroke-primary stroke-2"
                />
              )}
              <circle cx={position.x} cy={position.y} r={radius} className={fillClass} />
              {(node.node_type !== "entry" || hasFewEntries) && (
                <text
                  x={position.x}
                  y={position.y + radius + 18}
                  textAnchor="middle"
                  className="fill-foreground text-[13px]"
                >
                  {shorten(node.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function KnowledgeGraphDialog({
  project,
  open,
  onOpenChange,
}: {
  project: KnowledgeProject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [graph, setGraph] = useState<KnowledgeGraphResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    if (!project) return;
    setIsLoading(true);
    setError(null);
    try {
      const nextGraph = await knowledgeApi.getGraph(project.id);
      setGraph(nextGraph);
      setSelectedNodeId(nextGraph.nodes.find((node) => node.node_type === "project")?.id ?? null);
    } catch (loadError) {
      setGraph(null);
      setSelectedNodeId(null);
      setError(loadError instanceof Error ? loadError.message : "请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (open) void loadGraph();
  }, [loadGraph, open]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const displayedEntries = graph?.nodes.filter((node) => node.node_type === "entry").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            {project ? `${project.name} 的关系图谱` : "关系图谱"}
          </DialogTitle>
          <DialogDescription>
            仅按需读取已有索引；网页条目会归入对应文档集，项目文件和个人记录直接归入项目。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[430px] overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在整理关系…
            </div>
          ) : error ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center" role="alert">
              <p className="font-medium">图谱读取失败</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{error}</p>
              <Button className="mt-4 gap-2" variant="outline" onClick={() => void loadGraph()}>
                <RefreshCw className="h-4 w-4" /> 重试
              </Button>
            </div>
          ) : !graph || displayedEntries === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <Network className="h-8 w-8 text-muted-foreground" />
              <p className="mt-4 font-medium">还没有可展示的知识条目</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                先更新项目索引、新建记录或收录网页文档，图谱会自动从这些已有关系中生成。
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <span>点击节点查看详细信息；可用 Tab、Enter 或空格选择节点。</span>
                  <span>
                    当前展示 {displayedEntries} / 共 {graph.total_entries} 条
                    {graph.truncated ? "（仅显示最近 120 条）" : ""}
                  </span>
                </div>
                <GraphCanvas graph={graph} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="图例">
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-primary" /> 项目</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-secondary" /> 网页文档集</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-muted-foreground" /> 知识条目</span>
                </div>
              </section>

              <aside className="border bg-card p-4">
                {selectedNode ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-primary"><GraphNodeIcon node={selectedNode} /></span>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{nodeLabel(selectedNode)}</p>
                        <h3 className="mt-1 break-words font-semibold leading-6">{selectedNode.label}</h3>
                      </div>
                    </div>
                    {selectedNode.entry_type && (
                      <p className="border-l-2 border-primary/70 pl-3 text-sm text-muted-foreground">
                        类型：{selectedNode.entry_type}
                      </p>
                    )}
                    {selectedNode.source ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">原始来源</p>
                        <p className="mt-1 break-all font-mono text-xs leading-5">{selectedNode.source}</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">
                        {selectedNode.node_type === "project" ? "图谱根节点，代表当前知识库项目。" : "这是没有外部来源的本地记录。"}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">选择一个节点查看详细信息。</p>
                )}
              </aside>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
