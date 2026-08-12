use std::collections::HashSet;

use rusqlite::params;
use serde::Serialize;
use tauri::AppHandle;

const MAX_GRAPH_ENTRIES: usize = 120;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct KnowledgeGraphNode {
    pub id: String,
    pub label: String,
    pub node_type: String,
    pub entry_type: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct KnowledgeGraphEdge {
    pub source: String,
    pub target: String,
    pub relation_type: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct KnowledgeGraphResult {
    pub nodes: Vec<KnowledgeGraphNode>,
    pub edges: Vec<KnowledgeGraphEdge>,
    pub total_entries: i64,
    pub truncated: bool,
}

#[derive(Debug)]
struct GraphProject {
    id: String,
    name: String,
}

#[derive(Debug)]
struct GraphEntry {
    id: String,
    title: String,
    entry_type: String,
    source_path: Option<String>,
    source_url: Option<String>,
    source_collection_id: Option<String>,
    source_collection_name: Option<String>,
    source_collection_url: Option<String>,
}

fn build_knowledge_graph(
    project: GraphProject,
    entries: Vec<GraphEntry>,
    total_entries: i64,
) -> KnowledgeGraphResult {
    let project_node_id = format!("project:{}", project.id);
    let mut nodes = vec![KnowledgeGraphNode {
        id: project_node_id.clone(),
        label: project.name,
        node_type: "project".to_string(),
        entry_type: None,
        source: None,
    }];
    let mut edges = Vec::new();
    let mut added_collections = HashSet::new();

    for entry in entries {
        let entry_node_id = format!("entry:{}", entry.id);
        let source = entry.source_url.clone().or(entry.source_path.clone());

        nodes.push(KnowledgeGraphNode {
            id: entry_node_id.clone(),
            label: entry.title,
            node_type: "entry".to_string(),
            entry_type: Some(entry.entry_type),
            source,
        });

        let collection = entry.source_collection_id.zip(entry.source_collection_name);
        if let Some((collection_id, collection_name)) = collection {
            let collection_node_id = format!("collection:{}", collection_id);
            if added_collections.insert(collection_id) {
                nodes.push(KnowledgeGraphNode {
                    id: collection_node_id.clone(),
                    label: collection_name,
                    node_type: "collection".to_string(),
                    entry_type: None,
                    source: entry.source_collection_url,
                });
                edges.push(KnowledgeGraphEdge {
                    source: project_node_id.clone(),
                    target: collection_node_id.clone(),
                    relation_type: "contains".to_string(),
                });
            }
            edges.push(KnowledgeGraphEdge {
                source: collection_node_id,
                target: entry_node_id,
                relation_type: "contains".to_string(),
            });
        } else {
            edges.push(KnowledgeGraphEdge {
                source: project_node_id.clone(),
                target: entry_node_id,
                relation_type: "contains".to_string(),
            });
        }
    }

    KnowledgeGraphResult {
        nodes,
        edges,
        total_entries,
        truncated: total_entries > MAX_GRAPH_ENTRIES as i64,
    }
}

fn graph_project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphProject> {
    Ok(GraphProject {
        id: row.get(0)?,
        name: row.get(1)?,
    })
}

fn graph_entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphEntry> {
    Ok(GraphEntry {
        id: row.get(0)?,
        title: row.get(1)?,
        entry_type: row.get(2)?,
        source_path: row.get(3)?,
        source_url: row.get(4)?,
        source_collection_id: row.get(5)?,
        source_collection_name: row.get(6)?,
        source_collection_url: row.get(7)?,
    })
}

#[tauri::command]
pub async fn get_knowledge_graph(
    app_handle: AppHandle,
    project_id: String,
) -> Result<KnowledgeGraphResult, String> {
    let conn = crate::commands::knowledge::get_connection(&app_handle)?;
    let project = conn
        .query_row(
            "SELECT id, name FROM knowledge_projects WHERE id = ?1",
            [&project_id],
            graph_project_from_row,
        )
        .map_err(|e| e.to_string())?;
    let total_entries = conn
        .query_row(
            "SELECT COUNT(*) FROM knowledge_entries WHERE project_id = ?1",
            [&project_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT e.id, e.title, e.entry_type, e.source_path, e.source_url,
                    e.source_collection_id, c.name, c.entry_url
             FROM knowledge_entries e
             LEFT JOIN knowledge_web_collections c ON c.id = e.source_collection_id
             WHERE e.project_id = ?1
             ORDER BY e.updated_at DESC, e.id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let entries = statement
        .query_map(
            params![&project.id, MAX_GRAPH_ENTRIES as i64],
            graph_entry_from_row,
        )
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(build_knowledge_graph(project, entries, total_entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graph_entry(id: &str, title: &str, collection: Option<(&str, &str, &str)>) -> GraphEntry {
        GraphEntry {
            id: id.to_string(),
            title: title.to_string(),
            entry_type: "代码".to_string(),
            source_path: Some(format!("src/{}.rs", id)),
            source_url: None,
            source_collection_id: collection.map(|value| value.0.to_string()),
            source_collection_name: collection.map(|value| value.1.to_string()),
            source_collection_url: collection.map(|value| value.2.to_string()),
        }
    }

    #[test]
    fn graph_groups_web_entries_under_one_collection_and_keeps_local_entries_on_project() {
        let graph = build_knowledge_graph(
            GraphProject {
                id: "project-1".to_string(),
                name: "sanOmni".to_string(),
            },
            vec![
                graph_entry("local-entry", "本地命令", None),
                graph_entry(
                    "web-entry-1",
                    "Tauri command",
                    Some(("collection-1", "Tauri 文档", "https://tauri.app/docs/")),
                ),
                graph_entry(
                    "web-entry-2",
                    "Tauri state",
                    Some(("collection-1", "Tauri 文档", "https://tauri.app/docs/")),
                ),
            ],
            121,
        );

        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "project:project-1"));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "collection:collection-1"));
        assert!(graph.edges.iter().any(|edge| {
            edge.source == "project:project-1" && edge.target == "entry:local-entry"
        }));
        assert!(graph.edges.iter().any(|edge| {
            edge.source == "collection:collection-1" && edge.target == "entry:web-entry-1"
        }));
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| {
                    edge.source == "project:project-1" && edge.target == "collection:collection-1"
                })
                .count(),
            1,
        );
        assert_eq!(graph.total_entries, 121);
        assert!(graph.truncated);
    }
}
