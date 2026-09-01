# 官网自动同步方案 C：宝塔 Webhook + GitHub Webhook

> 适用：阿里云 ECS `47.103.81.161`，宝塔面板管理，官网 Nginx 静态托管于 `http://47.103.81.161:20266/`
> 效果：**每次 `git push` 到 GitHub `main` 分支，服务器自动拉取最新 `static/` 并覆盖站点目录，无需手动上传**

---

## 0. 同步链路总览

```
你 push 到 GitHub main
        │
        ▼
GitHub 仓库 Webhook（Settings → Webhooks）
        │  HTTP POST
        ▼
阿里云服务器 宝塔面板（Webhook 插件，默认 8888 端口 /hook）
        │  执行 bash 部署脚本
        ▼
下载 GitHub main.tar.gz → 解压 → 用 static/ 覆盖站点目录 → 完成
```

> 关键点：本项目 GitHub Actions 只发布 GitHub **Pages**，与服务器无关；
> 服务器的自动同步必须依赖**宝塔 Webhook 插件**接收 GitHub 的推送通知。

---

## 1. 前置条件（务必先完成）

| # | 事项 | 说明 | 状态 |
|---|------|------|------|
| 1 | 服务器能访问 github.com | `curl -fsSL -o /tmp/t.tar.gz https://github.com/keeplinux/petsoul_html_v1.0.0/archive/refs/heads/main.tar.gz && ls -l /tmp/t.tar.gz` 应能下载 | ✅ 已验证 |
| 2 | 宝塔面板可访问 | 默认端口 `8888` 当前对公网**未开放**（本机探测 Failed） | ⚠️ **需处理** |
| 3 | 阿里云安全组放行 | 入方向放行 `8888/TCP`（仅对你管理 IP 放行更安全） | ⚠️ 待办 |
| 4 | 宝塔安装 Webhook 插件 | 宝塔「软件商店」→ 搜索 **Webhook** → 安装 | ⏳ 待办 |
| 5 | 确认站点目录路径 | 宝塔「网站」→ 找到 20266 站点 →「网站目录」；如 `/www/wwwroot/silifield.com` | ⏳ 待确认 |

---

## 2. 服务器侧配置（宝塔面板）

### 2.1 打开宝塔面板的访问

- 方式一：阿里云 ECS → 安全组 → 入方向放行 `8888/TCP`，浏览器访问 `http://47.103.81.161:8888`。
- 方式二：SSH 登录服务器（22 已开放），执行 `bt` 命令查看/修改面板端口与安全入口。
- 若面板绑定了其他端口或域名，以实际为准。

### 2.2 安装 Webhook 插件

宝塔「软件商店」搜索 **Webhook** → 一键安装。
安装后在「软件商店 → 已安装」中找到 Webhook 插件进入。

### 2.3 创建 Webhook 并粘贴部署脚本

Webhook 插件界面 → **添加 Hook**，填写：
- Hook 名称：`petsoul-deploy`
- 脚本（Exec）：粘贴下方脚本，并**把 `SITE_DIR` 改成你站点实际目录**

```bash
#!/bin/bash
# ============================================================
# Petsoul / Silifield 官网自动部署脚本（宝塔 Webhook 触发）
# GitHub push -> webhook -> 下载 main.tar.gz -> 覆盖站点目录
# ============================================================
set -uo pipefail

# ★★★ 按实际修改：宝塔站点目录（网站 → 伪装/根目录）★★★
SITE_DIR="/www/wwwroot/silifield.com"

# 仓库与分支（此项目勿改）
REPO="keeplinux/petsoul_html_v1.0.0"
BRANCH="main"
TARBALL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"

# 临时目录（带 PID 防并发冲突）
TMP="/tmp/petsoul-sync-$$"

echo "[1/4] 下载仓库 ${REPO}@${BRANCH} ..."
mkdir -p "$TMP"
curl -fsSL "$TARBALL" -o "$TMP/repo.tar.gz" || { echo "下载失败"; rm -rf "$TMP"; exit 1; }

echo "[2/4] 解压 ..."
tar -xzf "$TMP/repo.tar.gz" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -1)
[ -n "$SRC" ] && [ -d "$SRC/static" ] || { echo "未找到 static/"; rm -rf "$TMP"; exit 1; }

echo "[3/4] 校验站点目录存在 ..."
[ -d "$SITE_DIR" ] || { echo "站点目录不存在: $SITE_DIR"; rm -rf "$TMP"; exit 1; }

echo "[4/4] 同步 static/ -> ${SITE_DIR}/ ..."
# 清空旧文件，复制最新 static（含新增图片 gh.png / national-emblem.png）
find "$SITE_DIR" -mindepth 1 -delete
cp -a "$SRC/static/." "$SITE_DIR/"

# 若 nginx 以 www 用户运行且出现权限问题，可放开下行：
# chown -R www:www "$SITE_DIR"

rm -rf "$TMP"
echo "✅ 部署完成: $(date '+%F %T')"
```

> 配置完成后，插件界面会生成一个 **Hook 地址**（形如以下两个之一）：
> `http://47.103.81.161:8888/hook?access_key=xxxxxxxx&payload=...`
> 复制它，第 3 步要用。

### 2.4 先手动测试一次

宝塔 Webhook 插件 Hook 列表 → 点 **测试**（或直接浏览器访问 Hook 地址）。
验证：刷新 `http://47.103.81.161:20266/` 页脚应出现「沪ICP备2026041993号 / 工商网监 / 营业执照」备案栏。

---

## 3. GitHub 侧配置（在 GitHub 网页操作）

1. 打开仓库：`https://github.com/keeplinux/petsoul_html_v1.0.0`
2. **Settings** → 左侧 **Webhooks** → **Add webhook**
3. 填写：

| 字段 | 值 |
|------|-----|
| **Payload URL** | 宝塔 Webhook 插件生成的 Hook 地址（见 2.3） |
| **Content type** | `application/json` |
| **Secret** | 可留空（宝塔插件用 access_key 鉴权） |
| **Which events** | 选 **Just the push event** |
| **Active** | ✅ 勾选 |

4. 点 **Add webhook** 保存。

---

## 4. 端到端验证

```bash
# 1) 本地修改任意 static 文件 → commit → push
cd /c/Users/geoff/Desktop/catwater/petsoul_html_v1.0.0
git add -A
git commit -m "test auto sync"
git push origin main

# 2) GitHub → 仓库 Settings → Webhooks → 最近投递（Recent Deliveries）应显示 200
#    （红 ❌ 说明服务器未收到，检查安全组/宝塔 webhook）

# 3) 服务器验证（SSH）：
#    tail -n 20 /www/server/panel/plugin/webhook/log 2>/dev/null  # 宝塔 webhook 日志

# 4) 浏览器强制刷新 http://47.103.81.161:20266/ 确认生效
```

---

## 5. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| GitHub Webhook 投递 502/502/超时 | 8888 未放行 / 面板端口不对 | 阿里云安全组放行；SSH 执行 `bt` 确认端口 |
| 投递 200 但网站未变 | 1. SITE_DIR 与实际站点目录不符 2. nginx 缓存 | 改 SITE_DIR；检查 `css/style.css?v=20260901-footer` 是否返回新内容 |
| `curl` 下载失败 | 服务器访问 github 慢/被墙 | 改用镜像：`https://ghproxy.com/https://github.com/...`；或改用方案 A（GitHub Actions → SSH） |
| 权限报错（`Permission denied`） | 站点目录属主 vs nginx 运行用户 | 脚本末开启 `chown -R www:www` 行 |
| 想恢复到手动 | 不再需要 | 删除宝塔 Webhook 与 GitHub Webhook 即可 |

---

## 6. 回滚

- 服务器回滚：SSH 进入服务器，把 `SITE_DIR` 手动替换为备份版本（建议平时在服务器上保留一份上次版本的 `tar` 快照）。
- 便捷做法：部署脚本先 `tar -czf /opt/petsoul-backup/prev-$(date +%F).tgz -C "$SITE_DIR" .` 再清空更新（建议自行追加）。

---

## 附：备选脚本（站点目录已是 Git 仓库时）

若你希望整个站点目录就是一个 git 工作区（`SITE_DIR` 本身 `git clone` 的仓库根，且宝塔站点根指向其 `static` 子目录），可用更简的 Hook 脚本：

```bash
#!/bin/bash
SITE_DIR="/www/wwwroot/silifield.com"
cd "$SITE_DIR" || exit 1
if [ ! -d .git ]; then
  rm -rf "$SITE_DIR"
  git clone --depth 1 -b main https://github.com/keeplinux/petsoul_html_v1.0.0.git "$SITE_DIR"
else
  git fetch --depth 1 origin main && git reset --hard origin/main
fi
echo "git deploy ok: $(date)"
```
（站点根需指向 `SITE_DIR/static`，由用户在宝塔站点设置中调整。）