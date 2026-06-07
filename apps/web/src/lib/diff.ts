/**
 * 草稿版本 diff:基于 prosemirror-recreate-steps 反推 transform,
 * 再用 prosemirror-changeset 压缩成 fromA/toA(旧文档坐标)+ fromB/toB(新文档坐标)。
 *
 * 输入:两个 ProseMirror JSON + schema(必须与渲染时同一套,否则 fromJSON 失败)。
 * 输出:旧文档需高亮的删除范围 + 新文档需高亮的新增范围,直接喂给 ReadOnlyDiffEditor。
 */
import { recreateTransform } from "@manuscripts/prosemirror-recreate-steps";
import { ChangeSet } from "prosemirror-changeset";
import { Node as PMNode, Schema } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/react";

export type DiffRange = { from: number; to: number };

export type DiffResult = {
  /** 旧文档坐标系下的删除范围(用于左栏红色删除线) */
  deletions: DiffRange[];
  /** 新文档坐标系下的新增范围(用于右栏绿色高亮) */
  insertions: DiffRange[];
};

export function computeChanges(
  oldDoc: JSONContent,
  newDoc: JSONContent,
  schema: Schema,
): DiffResult {
  const oldNode = PMNode.fromJSON(schema, oldDoc);
  const newNode = PMNode.fromJSON(schema, newDoc);

  const tr = recreateTransform(oldNode, newNode);
  let cs = ChangeSet.create(oldNode);
  cs = cs.addSteps(tr.doc, tr.mapping.maps, undefined);

  const deletions: DiffRange[] = [];
  const insertions: DiffRange[] = [];
  for (const c of cs.changes) {
    // changeset 文档:fromA/toA = 旧坐标(被删的范围),fromB/toB = 新坐标(被插的范围)。
    // 纯删除时 fromB === toB(无新内容);纯插入时 fromA === toA;替换两者皆非空。
    if (c.fromA !== c.toA) {
      deletions.push({ from: c.fromA, to: c.toA });
    }
    if (c.fromB !== c.toB) {
      insertions.push({ from: c.fromB, to: c.toB });
    }
  }
  return { deletions, insertions };
}
