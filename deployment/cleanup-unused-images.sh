#!/usr/bin/env bash
# ============================================================
# 清理 static/images/ 中未被引用的参考大图，把 ~39M 瘦身到几 MB
# 用法：
#   bash deployment/cleanup-unused-images.sh list     # 只列出（只读，安全）
#   bash deployment/cleanup-unused-images.sh prune    # 删除（先备份到 tmp/unused-images-backup/）
# 原理：在 static 的 index.html / css/*.css / js/*.js 中，
#       用「文件名子串匹配」(grep -F) 查找每个图片是否被引用，
#       完全规避中文文件名与复杂正则带来的误判。
# 已知被引用（勿删）：brand-cat-star.svg、postcard-cat.png、
#       暖泉饮水机V1.0样本1-cutout.png、暖泉饮水机V1.0样本3-cutout.png、
#       官网头部背景参考风格5.jpg（Hero 背景，CSS 引用）
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG_DIR="$PROJECT_DIR/static/images"
BACKUP_DIR="$PROJECT_DIR/tmp/unused-images-backup"
SOURCES=( "$PROJECT_DIR"/static/*.html "$PROJECT_DIR"/static/css/*.css "$PROJECT_DIR"/static/js/*.js )

MODE="${1:-list}"
case "$MODE" in
  list|prune) ;;
  *) echo "用法: $0 {list|prune}" >&2; exit 1 ;;
esac

[ -d "$IMG_DIR" ] || { echo "images 目录不存在: $IMG_DIR" >&2; exit 1; }

# 判断某图片名(or basename)是否被任一源文件引用
is_referenced() {
  local name="$1"
  local f
  for f in "${SOURCES[@]}"; do
    [ -f "$f" ] || continue
    if grep -Fq -- "$name" "$f"; then
      return 0
    fi
  done
  return 1
}

referenced_count=0
unreferenced_count=0

for img in "$IMG_DIR"/*; do
  [ -f "$img" ] || continue   # 跳过 extracted 等子目录
  name="$(basename "$img")"
  if is_referenced "$name"; then
    echo "[保留] $name"
    referenced_count=$((referenced_count+1))
  else
    size="$(stat -f %z "$img" 2>/dev/null || stat -c %s "$img" 2>/dev/null || echo 0)"
    echo "[未引用] $name  (${size} B)"
    unreferenced_count=$((unreferenced_count+1))
    if [[ "$MODE" == "prune" ]]; then
      mkdir -p "$BACKUP_DIR"
      cp -p "$img" "$BACKUP_DIR/"
      rm -f "$img"
    fi
  fi
done

echo "-------------------------------------------"
echo "保留(被引用): $referenced_count     未引用: $unreferenced_count"
if [[ "$MODE" == "prune" ]]; then
  echo "已删除并可恢复于: $BACKUP_DIR"
  du -sh "$IMG_DIR"
else
  echo "（list 为只读，未删除任何文件。确认可删后执行：$0 prune）"
fi

