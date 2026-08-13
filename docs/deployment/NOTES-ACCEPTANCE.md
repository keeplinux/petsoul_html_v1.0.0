# 验收清单与注意事项（Petsoul / Silifield 官网）

> 配合 `docs/deployment/DEPLOYMENT-SOP.md` 使用。分「部署前」「功能验收」「运维验收」三部分。

---

## 一、部署前 Checklist

- [ ] `silifield.com` 与 `www.silifield.com` 的 DNS `A` 记录已解析到 `47.103.81.161`。
- [ ] **ICP 备案已通过**（大陆 ECS 开放 80/443 的硬性前提；未通过不对外开放）。
- [ ] 阿里云安全组已放行 `22/80/443`（22 建议仅限你的 IP）。
- [ ] SSL 证书已签发，放入 `/etc/nginx/ssl/`，权限正确。
- [ ] `static/` 与最新代码一致（用 `git` 提交号或版本号 `?v=` 核验）。
- [ ] 方案 A：`systemctl is-enabled petsoul` 为 enabled，镜像进程 active。
- [ ] Nginx `nginx -t` 通过，已 reload。

---

## 二、功能验收标准

### 可访问性 & 安全
| # | 项目 | 验收标准 | 验证方式 |
|---|------|---------|---------|
| 1 | 首页加载 | `https://silifield.com/` 正常渲染，无 404/500/白屏 | 浏览器 + DevTools Network |
| 2 | HTTPS | 地址栏显示锁标，无证书告警 | 浏览器 |
| 3 | HTTP→HTTPS | `http://silifield.com/` 301 跳转 https | curl -IL / 浏览器 |
| 4 | www 与裸域 | `www.silifield.com` 与裸域均可访问并最终一致 | 浏览器分别访问 |
| 5 | 健康检查(方案A) | `curl http://127.0.0.1:3000/health` 返回 `OK` | 服务器执行 |
| 6 | gzip | CSS/JS/HTML 响应头含 `Content-Encoding: gzip` | `curl -I -H "Accept-Encoding: gzip" <url>` |

### 静态资源 & 交互
| # | 项目 | 验收标准 | 验证方式 |
|---|------|---------|---------|
| 7 | 静态资源 | 图片/字体/JS 全部 200，无失败请求 | DevTools Network 无红色 |
| 8 | 本地化依赖 | 无外部 CDN 请求失败；字体本地加载 | DevTools Network（无外部域） |
| 9 | 导航 | 锚点跳转 `#products/#data/#twin/#scenes/#contact` 正常 | 点击锚点实测 |
| 10 | 移动菜单 | <768px 汉堡菜单展开/收起正常，菜单项可跳转并关闭 | DevTools 设备模拟 |
| 11 | 明信片弹窗 | `[data-postcard-open]` 触发弹窗；点卡片/Esc/遮罩可关闭 | 实测 |
| 12 | 墨迹特效 | 桌面端鼠标划开背景（纯黑遮罩）正常 | hover 桌面实测 |
| 13 | 滚动动画 | 各区块滚动进入时渐入/计数动画正常 | 滚动实测 |

### 响应式 & 性能
| # | 项目 | 验收标准 | 验证方式 |
|---|------|---------|---------|
| 14 | 响应式 | 375px / 768px / 1440px 三档布局正常，无横向滚动条 | DevTools |
| 15 | 首屏性能 | 首屏加载建议 < 3s；图片 `loading=lazy` 生效 | DevTools / Lighthouse |
| 16 | Lighthouse | Performance 建议 ≥ 80（瘦身后更容易达标） | Lighthouse Audit |

---

## 三、运维验收标准

- [ ] `systemctl status petsoul`（方案 A）为 `active (running)`，`Restart=always`，kill 进程后能自愈。
- [ ] 日志有输出，logrotate 正常轮转，日志目录不无限增长。
- [ ] 磁盘/内存占用稳定；2C2G 下内存使用应明显低于 1G。
- [ ] 回滚预案可执行：切方案 B（纯 Nginx 静态）或恢复备份可秒级上线。

---

## 四、易踩坑清单（注意事项）

1. **备案**：未备案前不要开放 80/443 对外，否则域名被拦截；备案通过后再切 DNS/开放。
2. **证书到期**：免费证书约 1 年有效，务必设置到期提醒或 cron 自动续签，避免突然失联。
3. **www 与裸域**：两条 A 记录都要配，Nginx 两个 server_name 都要覆盖，防止用户输 www 打不开。
4. **39MB 瘦身**：`static/` 含大量未引用的参考大图（`官网头部背景参考风格*.png` 等每张 2M+）。部署前用 `deployment/cleanup-unused-images.sh list` 核对、`prune` 清理，可显著加快上传与加载。
5. **品牌名口径不一致**：页面显示「硅宠场域 / 上海硅宠场域科技」，仓库名与早期文档是「Petsoul / 上海灵宠科技」。上线前确认对外统一口径（页面、备案主体、证书、页脚一致）。
6. **架构一致性**：本机 Apple Silicon 编译的二进制不能在 x86_64 服务器直接运行；建议在服务器上编译，或交叉编译。
7. **安全组最小化**：只放开必需端口；`/health` 不建议公网暴露（Nginx 不代理它即可）。
8. **CORS 全放开**：项目当前 `CorsLayer::permissive()`，纯静态无 API 场景风险低；若未来加后端接口需收紧。
9. **回滚**：保留上一版 `static` 与二进制；一键 `rsync + systemctl restart` 或切方案 B，实现秒级回滚。
10. **服务账号权限**：用非特权 `petsoul` 用户运行，避免以 root 直接跑二进制。
