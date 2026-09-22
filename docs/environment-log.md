# 本地环境准备记录

本文件是环境排障记录，不是 AUTH-T16 应用故障注入结果。

- 主机：macOS26.5.1 / AppleM5Pro / 18逻辑CPU / 48GiB内存。
- 2026-09-23安装：Homebrew colima0.10.3、Lima2.2.0、dockerCLI29.8.1、Node24.21.0。未修改shell启动文件；命令内使用Node24路径。
- 独立Colima配置`yxt-permission`：10vCPU、24GiB RAM、35GiB数据盘、VZ/virtiofs。DockerEngine29.5.2。原型在本地独立Git仓库，规划输入保持只读。
- 03:09:01开始创建VM；03:10:49启动完成。Colima从iCloud工作目录尝试guest cd遭拒，后续全部容器命令在本地原型目录执行，未移动规划包。
- 初次三个镜像拉取均失败：DNS请求指向`[::1]:53`、connection refused。实查guest `/etc/resolv.conf`是指向不存在的systemd-resolved运行文件的符号链接，systemd-resolved不运行。`networkctl status eth0`给出的DHCP DNS为192.168.5.2。
- 在该独立VM中保留原链接为`/etc/resolv.conf.spike-original`，写入DHCP DNS192.168.5.2。getent能够解析；随后镜像拉取错误变为直连TCP超时，说明DNS层已修复但registry直连不可达。
- 对照实测：guest curl显式走现有主机代理192.168.5.2:7890，registry `/v2/`返回预期401；Docker daemon代理配置为空。保留`/etc/docker/daemon.json.spike-original`，只在该VM为daemon配置同一HTTP/HTTPS代理及本地no-proxy，重启daemon。没有更改主机网络配置。
- PostgreSQL/Redis/API最终版本、镜像digest、CPU/内存限制和实际性能窗口另存环境JSON，不依据镜像标签推断具体版本。

环境准备及排障耗时计入实际投入；不隐藏在“零成本脚手架”中。正式开发可否复用须另列文件和被替代工作项，当前折抵0。
