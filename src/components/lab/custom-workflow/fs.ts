import { join } from '@tauri-apps/api/path';
import { getLabsRoot } from '@/lib/pathUtils';
import { mkdir, writeFile, readFile, authorizeFsPaths, exists, readDir, remove, copyFile } from '@/services/secureFs';
import type { WorkflowDef } from './types';

const WORKFLOW_DIR = 'custom_workflows';
const WORKFLOWS_FILE = 'workflows.json';
const TEMP_DIR = 'temp';
const EXPORTS_DIR = 'exports';

// Ensure a directory exists
export async function ensureDir(path: string): Promise<void> {
  try {
    await authorizeFsPaths([path]);
    await mkdir(path, { recursive: true });
  } catch (e: any) {
    if (!String(e).includes('exists') && !String(e).includes('存在')) throw e;
  }
}

// Get workflow root directory
export async function getWorkflowRoot(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return join(labsRoot, WORKFLOW_DIR);
}

// Get temp directory for a specific execution
export async function getExecutionTempDir(executionId: string): Promise<string> {
  const root = await getWorkflowRoot();
  return join(root, TEMP_DIR, executionId);
}

// Get step output directory
export async function getStepDir(executionId: string, stepIndex: number): Promise<string> {
  const execDir = await getExecutionTempDir(executionId);
  return join(execDir, `step_${stepIndex}`);
}

// Get exports directory
export async function getExportsDir(): Promise<string> {
  const root = await getWorkflowRoot();
  return join(root, EXPORTS_DIR);
}

// ─── Workflow CRUD ─────────────────────────────────

async function getWorkflowsFilePath(): Promise<string> {
  const root = await getWorkflowRoot();
  return join(root, WORKFLOWS_FILE);
}

export async function loadWorkflows(): Promise<WorkflowDef[]> {
  try {
    const filePath = await getWorkflowsFilePath();
    await authorizeFsPaths([filePath]);
    if (!(await exists(filePath))) return [];
    const data = await readFile(filePath);
    const text = new TextDecoder().decode(new Uint8Array(data));
    return JSON.parse(text) as WorkflowDef[];
  } catch (e) {
    console.error('Failed to load workflows:', e);
    return [];
  }
}

export async function saveWorkflows(workflows: WorkflowDef[]): Promise<void> {
  const root = await getWorkflowRoot();
  await ensureDir(root);
  const filePath = await getWorkflowsFilePath();
  const data = new TextEncoder().encode(JSON.stringify(workflows, null, 2));
  await writeFile(filePath, data);
}

export async function saveWorkflow(workflow: WorkflowDef): Promise<void> {
  const workflows = await loadWorkflows();
  const index = workflows.findIndex(w => w.id === workflow.id);
  if (index >= 0) {
    workflows[index] = workflow;
  } else {
    workflows.push(workflow);
  }
  await saveWorkflows(workflows);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const workflows = await loadWorkflows();
  await saveWorkflows(workflows.filter(w => w.id !== id));
}

export async function duplicateWorkflow(id: string): Promise<WorkflowDef | null> {
  const workflows = await loadWorkflows();
  const original = workflows.find(w => w.id === id);
  if (!original) return null;
  const copy: WorkflowDef = {
    ...original,
    id: `wf_${Date.now()}`,
    name: `${original.name} (副本)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: original.nodes.map(n => ({ ...n, id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` })),
  };
  workflows.push(copy);
  await saveWorkflows(workflows);
  return copy;
}

// ─── Execution File Helpers ────────────────────────

// Copy input files to execution temp input directory
export async function prepareExecutionInput(executionId: string, inputPaths: string[]): Promise<string> {
  const execDir = await getExecutionTempDir(executionId);
  const inputDir = await join(execDir, 'step_input');
  await ensureDir(inputDir);
  
  for (const srcPath of inputPaths) {
    const name = srcPath.split(/[\\/]/).pop() || `input_${Date.now()}.png`;
    const destPath = await join(inputDir, name);
    await copyFile(srcPath, destPath);
  }
  
  return inputDir;
}

// List files in a directory
export async function listFilesInDir(dirPath: string): Promise<string[]> {
  try {
    await authorizeFsPaths([dirPath]);
    const entries = await readDir(dirPath);
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isFile) files.push(entry.path);
    }
    return files.sort();
  } catch {
    return [];
  }
}

// Copy final results to exports directory
export async function exportResults(outputPaths: string[], workflowName: string): Promise<string[]> {
  const exportsDir = await getExportsDir();
  await ensureDir(exportsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const exportedPaths: string[] = [];
  
  for (let i = 0; i < outputPaths.length; i++) {
    const ext = outputPaths[i].split('.').pop() || 'png';
    const fileName = outputPaths.length === 1
      ? `${workflowName}_${timestamp}.${ext}`
      : `${workflowName}_${timestamp}_${i + 1}.${ext}`;
    const destPath = await join(exportsDir, fileName);
    await copyFile(outputPaths[i], destPath);
    exportedPaths.push(destPath);
  }
  
  return exportedPaths;
}

// Clean up execution temp directory
export async function cleanupExecution(executionId: string): Promise<void> {
  try {
    const execDir = await getExecutionTempDir(executionId);
    await remove(execDir, { recursive: true } as any);
  } catch (e) {
    console.warn('Failed to cleanup execution temp:', e);
  }
}
