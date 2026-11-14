# dsh-breaker

> 给 DSH 装一个「跳闸」：一轮对话长时间没有任何进展，就自动把它取消掉。

**干什么**：监听 `agent/status` 与 `agent/assistant-stream`。当一轮 turn 处于 running、却连续 `stallMs` 毫秒没有任何模型输出，调用官方 `agent.cancel()` 把它中止。

**安装**

```bash
dsh plugin --profile desktop add github:ai-tools-works/dsh-breaker
```

装完重启 DSH。

**它会执行什么**：只调用 DSH 自己的 `agent.cancel()`。不读写你的文件，不发网络请求，不给模型增加任何工具权限。

**卸载**：`dsh plugin --profile desktop remove dsh-breaker`，然后重启。

---

## 配置

在 profile 的 `cordis.patch.yml` 里改 `breaker` 那一行的 `config`：

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `stallMs` | `90000` | 多久无进展算卡死（毫秒） |
| `checkMs` | `15000` | 多久扫一次（毫秒） |
| `keepInbox` | `true` | 取消时保留你排队待发的消息 |
| `graceMs` | `10000` | 取消后等多久再报告「仍未收敛」 |

## 它救得了什么、救不了什么

DSH 的取消是**协作式**的：`cancel` 会 abort 掉当前操作的 signal，然后等已经开始的 promise 自己停下来。

- **上游 provider 正常响应 abort** → 这一轮会停，UI 回到可输入状态。这是本插件主要起作用的场景。
- **上游 provider 不观察 signal（请求卡在网络上）** → promise 永远不 settle，`cancel` 不会让请求真正结束。这时插件只能在日志里报告「仍未收敛」，救不回来，需要重启 DSH 宿主（不是重启整台电脑，会话在磁盘上）。

如果你属于第二种情况，根本的修法在 provider 那一侧：把 signal 传进上游 `fetch`。本插件不碰别人的网络层，所以它做不到这件事。

## 当前状态

- `0.1.0`：初版。逻辑只用了公开接口，但没有在真实卡死场景下跑过（开发阶段本机命令不可用）。**第一次用请把 `stallMs` 调到 20000 左右，人为制造一次卡死做演练**，确认它真的会触发，再改回默认值。
- 没有侧边栏按钮。按钮需要另写 client 插件、要改 UI、而且会在 DSH 升级后失效，所以先不做。

## Roadmap

- `0.2`：侧边栏按钮（client 插件 + 手动触发）。
- `0.3`：可选「兜底重启宿主」。

## License

MIT © 2026 ai-tools-works
