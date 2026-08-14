# 开发预览工作流（3080 稳定版 + 3081–3089 预览池）

> 工具：`scripts/preview.sh`。本文是该工具配套的最佳实践 workflow。

## 不变量（Invariant）

1. **3080 永远是稳定版**。开发 session 跑在 3080 上，因此 3080 的存活 = 修复能力的存活。
   任何开发中的代码不得以任何方式绑定 3080。
2. **不在主 checkout 里开发**。主 checkout（`/home/mikewong/projs/fork/deepseek-harness`）
   是正在运行的代码，对它而言只读。所有修改发生在 git worktree 里。
3. **预览端口从池中分配**（3081–3089），由注册表 + flock 管理，并行 session 不会抢端口。
4. **预览数据与稳定版隔离**：每个预览有独立 `$DSH_HOME`，崩溃/脏数据不污染稳定版。

## 环境约束（当前机器实测）

- HOME、repo 父目录均为**只读**；只有 repo 内和 `/tmp` 可写。
  因此 worktree 放在 `.artifacts/previews-wt/`（gitignored），
  pnpm store 播种为 `.artifacts/pnpm-store` 的硬链接副本。
- 首次 `new` 会播种 store（一次性），之后每个预览 `pnpm install` 约 30s，
  `pnpm build` 约 3–5 分钟。

## 标准流程

```
        ┌─────────────────────────────────────────────┐
        │  3080 稳定版（开发 session 住在这里，不动）    │
        └─────────────────────────────────────────────┘
                         │ 驱动
                         ▼
  new ──► 在 worktree 改代码 ──► up ──► 浏览器验证 ──► 满意？
 (分配worktree+分支)            (分配308X)  (100.64.0.2:308X)  │
                                                   否 │    │ 是
                              ◄── 继续改 ◄──┐        │    ▼
                              （改完 down/up 重启生效）   promote（合并 + 人工重启 3080）
```

### 1. 开一个预览

```bash
scripts/preview.sh new my-feature          # 基于当前 HEAD
scripts/preview.sh new my-feature main     # 或基于指定分支
```

这会创建：worktree `.artifacts/previews-wt/my-feature` + 分支 `preview/my-feature`，
装好依赖并构建好 lib/web。

### 2. 在 worktree 里开发

所有编辑发生在 `.artifacts/previews-wt/my-feature/` 下。**绝不**直接改主 checkout。

### 3. 起预览验证

```bash
scripts/preview.sh up my-feature    # 自动分配 3081–3089 中空闲端口
scripts/preview.sh ls               # 查看所有实例及端口
scripts/preview.sh logs my-feature  # 出错时看日志
```

浏览器访问 `http://100.64.0.2:308X/`。改了代码后 `down` + `up` 重启生效。

### 4. 并行开发

重复 1–3，每个 feature 一个名字。端口池 9 个，用满时 `up` 会报错，
`ls` 找出不再需要的实例 `rm` 掉。

### 5. Promote（合并回稳定版）—— 人工关卡

预览验证满意后：

```bash
cd .artifacts/previews-wt/my-feature
git add -A && git commit -m "..."
# 在主 checkout 合并（3080 仍在跑旧代码，合并本身无风险）
git -C /home/mikewong/projs/fork/deepseek-harness merge preview/my-feature
scripts/preview.sh rm my-feature
```

**重启 3080 加载新代码是独立的人工动作**，不在本流程内自动发生。
重启前确认：主 checkout 构建通过（`pnpm build`）、冒烟测试过。
万一新版本 3080 起不来：`git reset --hard <上一个好 commit>` 再重启即可回滚——
因为开发从未污染过主 checkout 的历史，回滚永远干净。

## 故障速查

| 症状 | 排查 |
|---|---|
| `up` 报进程退出 | `scripts/preview.sh logs <name>`；常见是改出了编译错误 |
| 健康检查超时 | 日志里找 plugin/loader 报错；首次启动较慢，可再 `up` 一次 |
| 端口池耗尽 | `ls` 找 stopped 实例 `rm`，或 `down` 释放端口 |
| worktree 删不掉 | `git worktree remove --force <path>` 后重试 `rm` |
| 想保留分支但删实例 | 先 `git push` 或合并，再 `rm`（rm 会删本地分支） |

## 脚本设计要点（为什么这么做）

- **端口注册表**（`.artifacts/previews/<name>/port`）+ flock：防止两个并行
  session 同时抢到同一端口；同时检查端口真实 LISTEN 状态，防止注册表与
  现实脱节（进程被外部 kill 的情况）。
- **setsid + 进程组 kill**：`pnpm dsh web` 是 pnpm → node 多层进程，
  只杀顶层 pid 会留孤儿。setsid 使 pid=pgid，`kill -- -pid` 整组带走。
- **DSH_HOME 隔离**（`.artifacts/previews/<name>/home`）：全局 `~/.dsh` 只读，
  且预览的 profile/会话数据本就不该和稳定版混。
- **拒绝 3080**：分配逻辑跳过 + 分配后断言双保险。
