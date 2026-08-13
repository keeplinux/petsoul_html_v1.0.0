# Petsoul / 硅宠场域 Silifield 官网部署 SOP（阿里云 ECS + Nginx + silifield.com）

> 适用：阿里云 ECS（2 核 2G），公网 IP `47.103.81.161`，域名 `silifield.com`，已安装 Nginx。
> 项目形态：Rust(axum) 后端 + 纯静态前端，无构建工具/无数据库/无外部 CDN/无表单与第三方 API。
> 部署架构决策：**方案 A 为主**（Nginx 反代 → Rust axum 进程），**方案 B**（纯 Nginx 静态）作为回退预案。两者均已收录于本文档。

---

## 0. 关键前置（务必先完成，缺一不可）

| 前置 | 说明 | 是否必需 |
|------|------|---------|
| **ICP 备案** | 阿里云大陆 ECS 对外提供 80/443 服务**必须完成 ICP 备案**，否则域名会被拦截。周期约 1~3 周。未通过前**不要对外开放** | ✅ 硬性 |
| 域名实名认证 | `silifield.com` 需完成实名认证 | ✅ |
| DNS 解析 | `A 记录`：`silifield.com` → `47.103.81.161`；`A 记录`：`www.silifield.com` → `47.103.81.161` | ✅ |
| 安全组放行 | 入方向放行 `22 / 80 / 443` | ✅ |
| SSL 证书 | 阿里云免费 SSL 证书（有效期 1 年），绑定 `silifield.com`，放入服务器 `/etc/nginx/ssl/` | ✅ |

> 备案期间临时预览方法：用 `http://47.103.81.161:<端口>` + 自签证书，仅限调试，不对外开放域名。

---

## 1. 部署架构总览

### 方案 A（主）：Nginx 终止 TLS → 反代 → Rust axum
```
Internet --443/80--> Nginx(阿里云 ECS) --proxy_pass 127.0.0.1:3000--> axum(petsoul-website)
                             │                                               │
                             │ 证书 TLS 终止 / 80->301 / gzip                 │ ServeDir("static") / /health / gzip
                             └── systemd 守护，Restart=always                └── static/ 目录
```
- axum 进程常驻内存约 10~20MB，2C2G 富余。
- 保留项目自带的 `/health` 健康检查与压缩能力。

### 方案 B（回退）：纯 Nginx 静态
```
Internet --> Nginx --> root /opt/petsoul/static  (try_files + gzip on)
```
- 不跑 Rust 进程，最省资源、性能最好。
- 放弃 `/health` 与项目内压缩逻辑（Nginx gzip 可完全替代）。

---

## 2. 本机准备（在本地 Mac 执行）

```bash
cd /Users/fiyhong/Project/petsoul/petsoul_html_v1.0.0

# 2.1（可选但强烈建议）清理未引用大图，把 static/ 从 ~39MB 瘦身到几 MB
#     先用只读列出，确认后再执行清理脚本：
bash deployment/cleanup-unused-images.sh list      # 只列出不引用的大图
bash deployment/cleanup-unused-images.sh prune     # 删除（会先备份到 tmp/）

# 2.2 编译生产二进制（本机已装 cargo 1.95）
cargo build --release
# 产物：target/release/petsoul-website

# 2.3 一键部署（见第 5 节），或手动 scp/rsync
```

> **架构一致性注意**：本机编译的二进制需与服务器 CPU 架构一致（x86_64 Linux）。
> 若本机是 Apple Silicon（arm64），不要直接上传，改为在服务器上编译，或交叉编译（x86_64-unknown-linux-gnu）。最稳妥：直接在 ECS 上 `cargo build --release`。

---

## 3. 服务器初始化（SSH 登录 47.103.81.161）

```bash
# 以 Ubuntu/Debian 为例；CentOS 请相应替换 apt→yum/dnf
sudo apt update && sudo apt upgrade -y

# 创建部署目录与专用用户
sudo mkdir -p /opt/petsoul/{bin,static,logs,backup}
sudo useradd -r -s /sbin/nologin petsoul 2>/dev/null || true
sudo chown -R petsoul:petsoul /opt/petsoul

# 若采用"在服务器上编译"，安装 Rust（方案 A 才需要）
# curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3.1 阿里云安全组放行（控制台操作）
- 入方向规则：`80/TCP`、`443/TCP`、`22/TCP`（仅你的 IP 放行更安全）。

### 3.2 上传发布物到服务器
```bash
# 二进制（或改用 rsync 上传整个 release 目录）
scp /Users/fiyhong/Project/petsoul/petsoul_html_v1.0.0/target/release/petsoul-website root@47.103.81.161:/opt/petsoul/bin/

# static 目录（推荐 rsync 增量同步，--delete 保证删除本地已清理的旧大图）
rsync -avz --delete \
  /Users/fiyhong/Project/petsoul/petsoul_html_v1.0.0/static/ \
  root@47.103.81.161:/opt/petsoul/static/
```


---

## 4. 配置服务

### 4.1 方案 A：systemd 守护 Rust 服务
将 `deployment/petsoul.service` 放到服务器 `/etc/systemd/system/petsoul.service`：
```ini
[Unit]
Description=Petsoul Axum Server
After=network.target

[Service]
User=petsoul
Group=petsoul
WorkingDirectory=/opt/petsoul
ExecStart=/opt/petsoul/bin/petsoul-website
Environment=PORT=3000
Restart=always
RestartSec=3
StandardOutput=append:/opt/petsoul/logs/stdout.log
StandardError=append:/opt/petsoul/logs/stderr.log

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now petsoul
sudo systemctl status petsoul                           # active (running)
curl http://127.0.0.1:3000/health                        # 期望输出: OK
curl -I http://127.0.0.1:3000/                           # 静态页可访问
```

### 4.2 Nginx 配置
- 证书放入 `/etc/nginx/ssl/`：`silifield.com.pem`、`silifield.com.key`（权限 600）。
- **方案 A**：将 `deployment/nginx-silifield.conf` 放到 `/etc/nginx/conf.d/silifield.com.conf`（`proxy_pass 127.0.0.1:3000`）。
- **方案 B（回退）**：将 `deployment/nginx-silifield-static.conf` 放到 `/etc/nginx/conf.d/silifield.com-static.conf`，并**停用方案 A 进程**（`systemctl disable --now petsoul`）。

```bash
# 删除默认站点（避免 80 端口冲突兜底）
sudo rm -f /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default 2>/dev/null

sudo nginx -t                                   # 配置语法校验
sudo systemctl reload nginx                     # 热重载
```

---

## 5. 一键部署脚本（可选）

`deployment/deploy.sh` 封装了「本机编译 → 上传二进制与 static → 服务器重载 systemd/nginx」，顶层变量集中配置：
```bash
# 在 deployment/deploy.sh 顶部填写：SERVER_IP / SERVER_USER / APP_HOME 等
bash deployment/deploy.sh
```
脚本含安全判断（未填配置即退出）、失败中断（`set -e`）、并支持 `--static-only` / `--binary-only`。

---

## 6. 线上联调验收

```bash
# 服务器上（方案 A）
curl -I http://127.0.0.1:3000/                        # axum 直连
curl -s http://127.0.0.1:3000/health                  # => OK
curl -kI https://silifield.com/                       # 经 Nginx HTTPS（-k 暂忽略证书）
curl -IL http://silifield.com/                        # 应 301 -> https
tail -f /opt/petsoul/logs/stdout.log                  # 访问日志

# 外部验证（本机）
curl -kI https://silifield.com/
curl -I -H "Accept-Encoding: gzip" https://silifield.com/css/style.css   # 应含 Content-Encoding: gzip
```
其余功能/性能验收标准见 `docs/deployment/NOTES-ACCEPTANCE.md`。

---

## 7. 收尾与运维

- **最小暴露**：确认 `/health` 不对外（Nginx 未代理该路径即可；如需监控可单独配置）。
- **日志轮转**：新增 `/etc/logrotate.d/petsoul`，轮转 `/opt/petsoul/logs/*.log`（每日/大小阈值）。
- **备份**：保留本机 `git` + `static/` 源与 `target/release` 二进制；服务器 `static` 定期快照到 `/opt/petsoul/backup`。
- **升级 SOP**：`rsync` 新 static + 新二进制 → `sudo systemctl restart petsoul` → `curl /health`。
- **回滚预案**：A 失败切 B（纯 Nginx 静态），或恢复上一版备份后重启（秒级）。
- **证书到期提醒**：免费证书约 1 年有效，建议配置到期提醒或 cron 自动续签。

---

## 8. 文件清单（本部署工具包）

| 文件 | 用途 |
|------|------|
| `docs/deployment/DEPLOYMENT-SOP.md` | 本文档（主线 SOP） |
| `docs/deployment/NOTES-ACCEPTANCE.md` | 验收清单 + 注意事项 |
| `deployment/nginx-silifield.conf` | 方案 A Nginx 配置（反代） |
| `deployment/nginx-silifield-static.conf` | 方案 B Nginx 配置（纯静态复用） |
| `deployment/petsoul.service` | 方案 A systemd 单元 |
| `deployment/deploy.sh` | 一键部署脚本 |
| `deployment/cleanup-unused-images.sh` | 清理未引用大图，瘦身 static |
