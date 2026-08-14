#!/usr/bin/env bash
# preview.sh — 开发预览实例管理（3081–3089）
#
# 原则：
#   - 3080 永远是稳定版，本脚本拒绝以任何方式触碰 3080
#   - 开发只发生在 git worktree（repo 外的兄弟目录），主 checkout 只读
#   - 端口通过注册表 + flock 分配，避免并行 session 抢端口
#
# 用法：
#   scripts/preview.sh new <name> [base-branch]   创建 worktree + 分支
#   scripts/preview.sh up  <name>                 分配端口并后台启动预览
#   scripts/preview.sh ls                         列出所有预览实例
#   scripts/preview.sh logs <name>                跟踪日志
#   scripts/preview.sh down <name>                停止预览（保留 worktree）
#   scripts/preview.sh rm  <name>                 停止并删除 worktree + 分支
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
STABLE_PORT=3080
PORT_MIN=3081
PORT_MAX=3089
HOST="${PREVIEW_HOST:-100.64.0.2}"
# 注意：worktree 放在 repo 内的 .artifacts/ 下（gitignored），
# 因为 repo 之外（HOME / 父目录）在当前环境是只读的。
PREVIEW_HOME="${PREVIEW_HOME:-$REPO_ROOT/.artifacts/previews-wt}"
REGISTRY_ROOT="$REPO_ROOT/.artifacts/previews"
LOCKFILE="$REGISTRY_ROOT/.lock"

mkdir -p "$REGISTRY_ROOT" "$PREVIEW_HOME"

die()  { echo "preview: error: $*" >&2; exit 1; }
info() { echo "preview: $*" >&2; }

reg() { echo "$REGISTRY_ROOT/$1"; }

port_listening() { ss -tlnH "sport = :$1" 2>/dev/null | grep -q .; }

registered_ports() {
  for d in "$REGISTRY_ROOT"/*/; do
    [ -f "$d/port" ] && cat "$d/port"
  done
}

# 在 flock 保护下分配一个空闲且未注册的端口
claim_port() {
  (
    flock -x 9
    for p in $(seq "$PORT_MIN" "$PORT_MAX"); do
      [ "$p" = "$STABLE_PORT" ] && continue   # 双保险，永不可能触发
      if ! port_listening "$p" && ! registered_ports | grep -qx "$p"; then
        echo "$p"
        exit 0
      fi
    done
    exit 1
  ) 9>"$LOCKFILE"
}

require_name() {
  [ -n "${1:-}" ] || die "missing <name>. see usage in script header."
  case "$1" in
    *[!a-zA-Z0-9_-]*) die "name 只能包含字母、数字、-、_" ;;
  esac
  [ -d "$(reg "$1")" ] || die "预览 '$1' 不存在（先 preview.sh new $1）"
  return 0
}

cmd_new() {
  local name="${1:-}" base="${2:-HEAD}"
  require_name_new "$name"
  local wt="$PREVIEW_HOME/$name"
  local r; r="$(reg "$name")"; mkdir -p "$r"
  git -C "$REPO_ROOT" worktree add "$wt" -b "preview/$name" "$base" \
    || die "worktree 创建失败（base: $base）"
  echo "$wt" > "$r/worktree"
  echo "preview/$name" > "$r/branch"
  info "worktree: $wt  (branch: preview/$name)"
  info "安装依赖…"
  # 注1：HEAD 的 lockfile 与 patchedDependencies 可能不一致（主 checkout 的
  #      lockfile 常处于未提交状态），预览实例用非 frozen 模式安装。
  # 注2：全局 pnpm store（~/.local/share/pnpm/store）只读，因此播种一个
  #      硬链接副本到 .artifacts/ 作为所有预览共享的可写 store。
  local store="$REPO_ROOT/.artifacts/pnpm-store"
  if [ ! -d "$store" ]; then
    info "播种共享 pnpm store（硬链接副本，一次性）…"
    cp -al "$HOME/.local/share/pnpm/store" "$store" 2>/dev/null \
      || cp -r "$HOME/.local/share/pnpm/store" "$store" \
      || die "store 播种失败"
  fi
  (cd "$wt" && pnpm install --no-frozen-lockfile --store-dir "$store") \
    || die "pnpm install 失败"

  # node-pty 的 linux-x64 原生模块需本地编译（pnpm 默认不放行 install 脚本）
  local pty_dir
  pty_dir="$(echo "$wt"/node_modules/.pnpm/node-pty@*/node_modules/node-pty)"
  if [ -d "$pty_dir" ] && ! find "$pty_dir" -name pty.node \( -path "*linux*" -o -path "*Release*" \) | grep -q .; then
    info "编译 node-pty 原生模块…"
    (cd "$pty_dir" && npm run install) || die "node-pty 编译失败"
  fi

  info "构建 workspace（lib + web，约 3–5 分钟）…"
  (cd "$wt" && pnpm build) || die "pnpm build 失败"
  info "完成。修改代码后运行: scripts/preview.sh up $name"
}

require_name_new() {
  [ -n "${1:-}" ] || die "missing <name>. see usage in script header."
  case "$1" in
    *[!a-zA-Z0-9_-]*) die "name 只能包含字母、数字、-、_" ;;
  esac
  [ -e "$(reg "$1")" ] && die "预览 '$1' 已存在"
  [ -e "$PREVIEW_HOME/$1" ] && die "目录已存在: $PREVIEW_HOME/$1"
  return 0
}

cmd_up() {
  local name="${1:-}"; require_name "$name"
  local r; r="$(reg "$name")"
  [ -f "$r/port" ] && die "'$name' 已在运行（端口 $(cat "$r/port")）。先 down 再 up。"
  local wt; wt="$(cat "$r/worktree")"
  [ -d "$wt" ] || die "worktree 不见了: $wt"

  local port; port="$(claim_port)" || die "3081–3089 已全部占用"
  [ "$port" = "$STABLE_PORT" ] && die "internal: 拒绝占用稳定端口"  # 永不应触发
  echo "$port" > "$r/port"

  # 预览实例使用独立的 DSH_HOME（全局 ~/.dsh 只读，且数据应与稳定版隔离）
  local dsh_home="$r/home"
  mkdir -p "$dsh_home"

  info "启动 '$name' @ http://$HOST:$port  (worktree: $wt)"
  (
    cd "$wt"
    DSH_HOME="$dsh_home" \
    setsid nohup pnpm dsh web --host "$HOST" --port "$port" \
      --allow-trusted-host-configuration \
      >"$r/log" 2>&1 &
    echo $! > "$r/pid"
  )

  # 健康检查：最多等 30s
  local pid; pid="$(cat "$r/pid")"
  for _ in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || { echo "$port" > /dev/null; rm -f "$r/port" "$r/pid"; die "进程退出，日志: $r/log"; }
    if curl -sf -o /dev/null "http://$HOST:$port/" 2>/dev/null; then
      info "就绪 ✅  http://$HOST:$port/"
      return 0
    fi
    sleep 1
  done
  info "已启动但 30s 内未通过健康检查，查看日志: scripts/preview.sh logs $name"
}

cmd_down() {
  local name="${1:-}"; require_name "$name"
  local r; r="$(reg "$name")"
  if [ -f "$r/pid" ]; then
    local pid; pid="$(cat "$r/pid")"
    # setsid 启动，pid 即 pgid，杀整个进程组（pnpm → node 子进程）
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -9 -- -"$pid" 2>/dev/null || true
    info "'$name' 已停止"
  else
    info "'$name' 未在运行"
  fi
  rm -f "$r/pid" "$r/port"
}

cmd_ls() {
  printf '%-16s %-6s %-10s %s\n' NAME PORT STATUS WORKTREE
  for d in "$REGISTRY_ROOT"/*/; do
    local n; n="$(basename "$d")"
    local port="-" status="stopped" wt="?"
    [ -f "$d/port" ] && port="$(cat "$d/port")"
    [ -f "$d/worktree" ] && wt="$(cat "$d/worktree")"
    if [ -f "$d/pid" ] && kill -0 "$(cat "$d/pid")" 2>/dev/null; then
      status="running  http://$HOST:$port/"
    fi
    printf '%-16s %-6s %-10s %s\n' "$n" "$port" "$status" "$wt"
  done
}

cmd_logs() {
  local name="${1:-}"; require_name "$name"
  tail -f "$(reg "$name")/log"
}

cmd_rm() {
  local name="${1:-}"; require_name "$name"
  cmd_down "$name" || true
  local r; r="$(reg "$name")"
  local wt branch
  wt="$(cat "$r/worktree" 2>/dev/null || true)"
  branch="$(cat "$r/branch" 2>/dev/null || true)"
  [ -n "$wt" ] && git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
  [ -n "$branch" ] && git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null || true
  rm -rf "$r"
  info "'$name' 已清理（如需保留分支，请先合并或 push）"
}

case "${1:-}" in
  new)  shift; cmd_new "$@" ;;
  up)   shift; cmd_up "$@" ;;
  down) shift; cmd_down "$@" ;;
  ls)   cmd_ls ;;
  logs) shift; cmd_logs "$@" ;;
  rm)   shift; cmd_rm "$@" ;;
  *)    sed -n '2,20p' "$0"; exit 1 ;;
esac
