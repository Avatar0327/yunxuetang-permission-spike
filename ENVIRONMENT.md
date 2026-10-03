# Round 2 baseline 817256b：环境与执行事实

测量仓库：https://github.com/Avatar0327/yunxuetang-permission-spike
测量提交：817256bf1e1fc722aaa5f0c21878e84fe8df1306，detached HEAD。
本文件由 Codex 在用户完成测量后生成，只记录事实。原始测量文件保持原样。

## 执行方式和阶段时间

三项测量由用户在本机“终端”App 中执行，执行脚本为 `run-baseline.sh`；其原文作为证据文件提交。用户报告终端显示热窗、冷窗脚本退出码均为 1，回归已执行，脚本以“全部完成”结束。这里不重新执行测量或汇总脚本。
时间来自对应的 `*-start-utc.txt` 和 `*-end-utc.txt`，记录的是阶段脚本开始/结束；不把包含构建、seed、清理的阶段总时长换算成负载时长。

| 阶段 | 开始 UTC | 结束 UTC |
|---|---|---|
| hot | 2026-10-03T09:23:56Z | 2026-10-03T09:36:56Z |
| cold | 2026-10-03T09:36:56Z | 2026-10-03T09:47:50Z |
| regression | 2026-10-03T09:47:50Z | 2026-10-03T09:49:09Z |

`run-baseline.sh` 按 hot、cold、regression 顺序调用原脚本，热/冷窗参数分别是 `candidate hot`、`candidate cold`。其三项调用均为 `bash tools/...`，脚本本身没有 `caffeinate -dims`；终端外层是否使用 caffeinate，没有写入当前证据。测量前电源记录为 AC Power；测量期间机器独占情况没有另存逐时记录。

## 本机实际环境

macOS 26.5.1，BuildVersion 25F80；Apple M5 Pro；18 逻辑 CPU；物理内存 51539607552 字节（48 GiB）。uname 的完整原文见本文件附录。Node（脚本固定 PATH）为 v24.21.0；Homebrew node@24 24.21.0、python@3.14 3.14.8、colima 0.10.3、docker CLI 29.8.2。准备过程中通过 Homebrew 安装 Python 3.14.8，并安装/升级其依赖；未调整测量脚本或依赖锁。

直接复用已有 `yxt-permission`：原状态 Stopped，aarch64、docker runtime、vmType vz、CPU 10、memory 24 GiB、disk 35 GiB。未删除、重建或改变实例资源参数。启动后 docker context 为 colima-yxt-permission。Docker Server 29.5.2，VM Ubuntu 24.04.4 LTS、Linux 6.8.0-117-generic、aarch64；Docker info 报告 10 CPU、23.42 GiB Total Memory。完整 YAML、Docker context/info、容器 inspect 和卷列表原文见附录。

启动前未发现 yxt-api-a / yxt-api-b；已有 yxt-pg、yxt-redis 和 yxt-permission-pgdata 卷，均复用。还记录到一个匿名卷 c0a59a38192012094cf254770dab37b209286695abc4a9a9e4ec4179be749932，未操作该卷。
PG image digest：postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652；资源上限 4 CPU / 8589934592 字节（8 GiB）。Redis image digest：redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f；资源上限 1 CPU / 1073741824 字节（1 GiB）。现有 PG 启动参数为 shared_buffers=2GB、work_mem=16MB、max_connections=160、shared_preload_libraries=pg_stat_statements、track_io_timing=on；下述已知例外之外与原脚本一致。

`ls -d` 记录到 /Users/peng/Agent本地开发/云学堂权限预研；仅检查该目录是否存在，未读取或修改其中内容。未修改规划仓库 yunxuetang-replica-planning。

## track_commit_timestamp 已知例外

现有 PG 容器启动参数中缺少 `-c track_commit_timestamp=on`。用户已确认该容器创建于 17ed824 之前，第 1 轮在 2026-09-22T22:22Z 用 tools/enable-commit-timestamps.sh 通过 ALTER SYSTEM 开启该参数；第 1 轮参考窗口的 postgresql-settings.json 均为 on。用户授权仅此启动参数差异允许复用。
本次 `SHOW track_commit_timestamp` 核验原文为：

```text
on
```

本次没有执行 enable-commit-timestamps.sh。热窗、冷窗 runtime/postgresql-settings.json 均记录 track_commit_timestamp 为 on。

## 基础设施启动时序

第一次 start-infrastructure.sh 退出码为 1，原 start-infrastructure.txt 未改动，原文：

```text
yxt-pg
yxt-redis
/var/run/postgresql:5432 - rejecting connections
```

用户核实原因：脚本在 docker start 后立即执行 pg_isready，没有等待；rejecting connections 表示 PG 仍在启动或崩溃恢复中。PG 日志保存在 pg-startup-log.txt。
经用户授权，执行最多 120 秒的就绪等待；首次探测已经 accepting connections。等待过程原文：

```text
start_utc=2026-10-03T09:17:54.291130+00:00
2026-10-03T09:17:54.359106+00:00 exit=0 /var/run/postgresql:5432 - accepting connections 
end_utc=2026-10-03T09:17:54.359207+00:00
elapsed_seconds=0.06808962501236238
ready=true
```

等待耗时 0.06808962501236238 秒。此值仅为后续就绪探测耗时，不是首次 docker start 到 PG 就绪的总时长。
随后将脚本重跑一次，输出另存 start-infrastructure-retry1.txt，退出码原文为 0。重跑输出：

```text
yxt-pg
yxt-redis
/var/run/postgresql:5432 - accepting connections
PONG
```

## nohup 方式失败与执行移交

Codex 曾按原指令以 nohup 包装热窗命令，返回 PID 97402。随后核查该 PID 已不存在，未生成 hot-start-utc.txt、hot-script-exit.txt 或 hot/ 目录，只留下空的 hot.out（0 字节）。该次后台启动未形成测量证据，没有据此重跑窗口。
用户随后要求 Codex 停止启动命令和操作 Docker/Colima，改由用户在“终端”App 执行三项测量。用户本轮授权 Codex 仅从第五节交回证据继续；本轮没有再次运行窗口、回归或 Docker/Colima 命令。

## API 镜像构建

未手工预构建 API 镜像，所以没有 prebuild.txt。目标镜像最初不存在，热窗原脚本在 hot/build.txt 中记录了构建过程；冷窗复用同名镜像。
固定 tag：yxt-permission:spike-817256bf1e1f；label：org.opencontainers.image.revision=817256bf1e1fc722aaa5f0c21878e84fe8df1306；构建参数由原脚本固定为 HTTP_PROXY=http://192.168.5.2:7890、HTTPS_PROXY=http://192.168.5.2:7890、NO_PROXY=localhost,127.0.0.1,yxt-pg,yxt-redis；构建上下文为该测量提交目录 `.`。
构建日志记录 manifest list digest sha256:cab9931552976ae264f851832d86ffbeada0a92b8bdb1295c3812d13d8055650。

## 参考环境比较、异常和执行差异

用户给出的参考值 macOS 26.5.1、M5 Pro、18 逻辑 CPU、48 GiB、Node v24.21.0、Colima vz / 10 CPU / 24 GiB 与本机记录相同。其他参考版本值未提供，不能逐项比较。
已记录的执行差异：PG 命令行缺少 track_commit_timestamp（已获准例外，实际 on）；首次基础设施启动退出码 1（用户核实为启动时序问题，授权等待后重跑退出码 0）；nohup 启动失败后移交用户终端；run-baseline.sh 自身未包装 caffeinate；Codex 本轮没有测量期间独占或外层 caffeinate 的独立证据。
Colima 原启动输出还含一条 TCP 53 转发警告，完整警告保留在 existing-environment.txt 及本文件附录中。
交回证据前一次只读 git ls-remote 查询返回 `Error in the HTTP2 framing layer`，没有取得远端分支查询结果；推送采用不强制覆盖的普通 git push。
读取现有目录时未发现 incomplete.txt；没有重跑或删除任何窗口及回归数据。

## 文件指纹、完整包和入库范围

MANIFEST.json 对本目录内每个普通文件计算字节数和 SHA-256；符号链接单独记录 target、目标字符串字节数及该字符串的 SHA-256，不解引用 node_modules 外部依赖。MANIFEST.json 不能包含自身最终内容的 SHA-256，因此自身作为唯一自引用排除项，其字节数及 SHA-256 写入包外 ARCHIVE.json。
完整 tar.gz 包保留本目录全部内容，包括原回归脚本创建的隔离源码快照和 node_modules 符号链接；不跟随该链接打包外部目录。完整包大小、SHA-256 和 MANIFEST.json 的指纹写入包外 ARCHIVE.json，并放到证据分支根目录。
孤儿证据分支不复制应用源码及依赖锁。regression/workspace 中除 evidence/raw 原始产物之外的自动归档源码、说明、配置和依赖符号链接，仅在完整包保留；MANIFEST.json 中逐项标注“未入库”。run-baseline.sh 作为用户指定的执行证据原文提交。根目录 ENVIRONMENT.md 与 MANIFEST.json 和本机原件逐字节一致。
现有普通文件均小于 50,000,000 字节，因此无需为入库而 gzip 单文件。所有原始文件保持原样；只新增本环境说明及 MANIFEST.json。

## 第三节环境记录原文

```text
2026-10-03T07:17:37Z
ProductName:		macOS
ProductVersion:		26.5.1
BuildVersion:		25F80
Apple M5 Pro
18
51539607552
Darwin zhipengdeMacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:12 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6050 arm64
Now drawing from 'AC Power'
 -InternalBattery-0 (id=23003235)	80%; AC attached; not charging present: true
PROFILE           STATUS     ARCH       CPUS    MEMORY    DISK     RUNTIME    ADDRESS
yxt-permission    Stopped    aarch64    10      24GiB     35GiB    docker     
colima 0.10.3
docker 29.8.2
node@24 24.21.0
python@3.14 3.14.8
v24.21.0
/opt/homebrew/bin/python3
Python 3.14.8
Python 3.14.8
time="2026-10-03T15:25:15+08:00" level=info msg="starting colima [profile=yxt-permission]"
time="2026-10-03T15:25:15+08:00" level=info msg="runtime: docker"
time="2026-10-03T15:25:16+08:00" level=info msg="starting ..." context=vm
time="2026-10-03T15:25:16+08:00" level=info msg="Using the existing instance `colima-yxt-permission`"
time="2026-10-03T15:25:16+08:00" level=info msg="Starting the instance `colima-yxt-permission` with internal VM driver `vz`"
time="2026-10-03T15:25:16+08:00" level=info msg="[hostagent] Replacing `http_proxy` value `http://127.0.0.1:7890` with `http://192.168.5.2:7890`"
time="2026-10-03T15:25:16+08:00" level=info msg="[hostagent] Replacing `https_proxy` value `http://127.0.0.1:7890` with `http://192.168.5.2:7890`"
time="2026-10-03T15:25:16+08:00" level=info msg="[hostagent] Replacing `http_proxy` value `http://127.0.0.1:7890` with `http://192.168.5.2:7890`"
time="2026-10-03T15:25:16+08:00" level=info msg="[hostagent] Replacing `https_proxy` value `http://127.0.0.1:7890` with `http://192.168.5.2:7890`"
time="2026-10-03T15:25:17+08:00" level=info msg="[hostagent] hostagent socket created at /Users/peng/.colima/_lima/colima-yxt-permission/ha.sock"
time="2026-10-03T15:25:17+08:00" level=info msg="[hostagent] Starting VZ (hint: to watch the boot progress, see `/Users/peng/.colima/_lima/colima-yxt-permission/serial*.log`)"
time="2026-10-03T15:25:17+08:00" level=info msg="[hostagent] Mounting disk `colima-yxt-permission` on `/mnt/lima-colima-yxt-permission`"
time="2026-10-03T15:25:17+08:00" level=info msg="[hostagent] Converting `/Users/peng/.colima/_lima/_disks/colima-yxt-permission/datadisk` (raw) to a raw disk `/Users/peng/.colima/_lima/_disks/colima-yxt-permission/datadisk`"
time="2026-10-03T15:25:17+08:00" level=info msg="[hostagent] [VZ] - vm state change: running"
time="2026-10-03T15:25:21+08:00" level=info msg="[hostagent] SSH server does not seem to be running on vsock port, using usernet forwarder"
time="2026-10-03T15:25:22+08:00" level=info msg="SSH Local Port: 57061"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Waiting for the essential requirement 1 of 3: `ssh`"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] The essential requirement 1 of 3 is satisfied"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Waiting for the essential requirement 2 of 3: `user session is ready for ssh`"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] The essential requirement 2 of 3 is satisfied"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Waiting for the essential requirement 3 of 3: `Explicitly start ssh ControlMaster`"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] The essential requirement 3 of 3 is satisfied"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Waiting for the guest agent to be running"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Forwarding `/var/run/docker.sock` (guest) to `/Users/peng/.colima/yxt-permission/docker.sock` (host)"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Forwarding `/var/run/containerd/containerd.sock` (guest) to `/Users/peng/.colima/yxt-permission/containerd.sock` (host)"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Guest agent is running"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Waiting for the final requirement 1 of 1: `boot scripts must have finished`"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Time sync: guest agent is alive, starting time synchronization"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Not forwarding TCP 0.0.0.0:22"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Forwarding TCP from 0.0.0.0:53 to 0.0.0.0:53"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Not forwarding TCP [::]:22"
time="2026-10-03T15:25:22+08:00" level=info msg="[hostagent] Forwarding TCP from [::]:53 to 0.0.0.0:53"
time="2026-10-03T15:25:22+08:00" level=warning msg="[hostagent] failed to set up forwarding tcp port 53 (negligible if already forwarded)" error="failed to run [ssh -F /dev/null -o IdentityFile=\"/Users/peng/.colima/_lima/_config/user\" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o NoHostAuthenticationForLocalhost=yes -o PreferredAuthentications=publickey -o Compression=no -o BatchMode=yes -o IdentitiesOnly=yes -o GSSAPIAuthentication=no -o Ciphers=\"^aes128-gcm@openssh.com,aes256-gcm@openssh.com\" -o User=peng -o ControlMaster=auto -o ControlPath=\"/Users/peng/.colima/_lima/colima-yxt-permission/ssh.sock\" -o ControlPersist=yes -T -O forward -L 0.0.0.0:53:[::]:53 -N -f -p 57061 127.0.0.1 --]: ``: exit status 255"
time="2026-10-03T15:25:25+08:00" level=info msg="[hostagent] The final requirement 1 of 1 is satisfied"
time="2026-10-03T15:25:25+08:00" level=info msg="READY. Run `limactl shell colima-yxt-permission` to open the shell."
installing: 386 OK
installing: amd64 OK
{
  "supported": [
    "linux/arm64",
    "linux/amd64",
    "linux/386"
  ],
  "emulators": [
    "python3.12",
    "qemu-i386",
    "qemu-x86_64"
  ]
}
time="2026-10-03T15:25:27+08:00" level=info msg="provisioning ..." context=docker
colima-yxt-permission
Current context is now "colima-yxt-permission"
time="2026-10-03T15:25:28+08:00" level=info msg="starting ..." context=docker
time="2026-10-03T15:25:29+08:00" level=info msg=done
PROFILE           STATUS     ARCH       CPUS    MEMORY    DISK     RUNTIME    ADDRESS
yxt-permission    Running    aarch64    10      24GiB     35GiB    docker     
# Number of CPUs to be allocated to the virtual machine.
# Default: 2
cpu: 10

# Size of the disk in GiB to be allocated to the virtual machine for container data.
# NOTE: value can only be increased after virtual machine has been created.
#
# Default: 100
disk: 35

# Size of the memory in GiB to be allocated to the virtual machine.
# Default: 2
memory: 24

# Architecture of the virtual machine (x86_64, aarch64, host).
#
# NOTE: value cannot be changed after virtual machine is created.
# Default: host
arch: aarch64

# Container runtime to be used (docker, containerd).
#
# NOTE: value cannot be changed after virtual machine is created.
# Default: docker
runtime: docker

# AI model runner (docker, ramalama).
# Both require krunkit VM type for GPU access.
# docker: Uses Docker Model Runner.
# ramalama: Uses Ramalama.
#
# Default: docker
modelRunner: docker

# Set custom hostname for the virtual machine.
# Default: colima
#          colima-profile_name for other profiles
hostname: colima-yxt-permission

# Kubernetes configuration for the virtual machine.
kubernetes:
  # Enable kubernetes.
  # Default: false
  enabled: false
  
  # Kubernetes version to use.
  # This needs to exactly match a k3s version https://github.com/k3s-io/k3s/releases
  # Default: latest stable release
  version: v1.35.0+k3s1
  
  # Additional args to pass to k3s https://docs.k3s.io/cli/server
  # Default: traefik is disabled
  k3sArgs:
    - --disable=traefik
  
  # Kubernetes port to listen on
  # A common port is 6443, though left unbound to ensure no port conflicts
  # Default: pick random unbound port
  port: 0

# Auto-activate on the Host for client access.
# Setting to true does the following on startup
#  - sets as active Docker context (for Docker runtime).
#  - sets as active Kubernetes context (if Kubernetes is enabled).
#  - sets as active Incus remote (for Incus runtime).
# Default: true
autoActivate: true

# Network configurations for the virtual machine.
network:
  # Assign reachable IP address to the virtual machine.
  # NOTE: this is currently macOS only and ignored on Linux.
  # Default: false
  address: false
  
  # Network mode for the virtual machine (shared, bridged).
  # NOTE: this is currently macOS only and ignored on Linux.
  # Default: shared
  mode: shared
  
  # Network interface to use for bridged mode.
  # This is only used when mode is set to bridged.
  # NOTE: this is currently macOS only and ignored on Linux.
  # Default: en0
  interface: en0
  
  # Use the assigned IP address as the preferred route for the VM.
  # Note: this only has an effect when `address` is set to true.
  # Default: false
  preferredRoute: false
  
  # Custom DNS resolvers for the virtual machine.
  #
  # EXAMPLE
  # dns: [8.8.8.8, 1.1.1.1]
  #
  # Default: []
  dns: null
  
  # DNS hostnames to resolve to custom targets using the internal resolver.
  # This setting has no effect if a custom DNS resolver list is supplied above.
  # It does not configure the /etc/hosts files of any machine or container.
  # The value can be an IP address or another host.
  #
  # EXAMPLE
  # dnsHosts:
  #   example.com: 1.2.3.4
  dnsHosts: {}
  
  # Replicate host IP addresses in the VM. This enables port forwarding to specific
  # host IP addresses.
  #   e.g. `docker run --port 10.0.1.2:8080:8080 alpine` would only forward to the
  #   specified IP address.
  #
  # Default: false
  hostAddresses: false
  
  # Custom gateway address for the virtual machine.
  # The last octet needs to be 2.
  #
  # EXAMPLE
  # gatewayAddress: 192.168.10.2
  #
  # Default: 192.168.5.2
  gatewayAddress: 192.168.5.2

# ===================================================================== #
# ADVANCED CONFIGURATION
# ===================================================================== #

# Forward the host's SSH agent to the virtual machine.
# Default: false
forwardAgent: false

# Docker daemon configuration that maps directly to daemon.json.
# https://docs.docker.com/engine/reference/commandline/dockerd/#daemon-configuration-file.
# NOTE: some settings may affect Colima's ability to start docker. e.g. `hosts`.
#
# EXAMPLE - disable buildkit
# docker:
#   features:
#     buildkit: false
#
# EXAMPLE - add insecure registries
# docker:
#   insecure-registries:
#     - myregistry.com:5000
#     - host.docker.internal:5000
#
# Colima default behaviour: buildkit enabled
# Default: {}
docker: {}

# Virtual Machine type (krunkit, qemu, vz)
# NOTE: this is macOS 13 only. For Linux and macOS <13.0, qemu is always used.
#
# vz is macOS virtualization framework and requires macOS 13.
# krunkit runs super‑light VMs on macOS/ARM64 with a focus on GPU access. It is experimental.
#
# NOTE: value cannot be changed after virtual machine is created.
# Default: qemu
vmType: vz

# Port forwarder for the virtual machine (ssh, grpc, none).
# ssh is more stable but supports only TCP.
# grpc supports both TCP and UDP, but is experimental.
# none disables port forwarding.
#
# Default: ssh
portForwarder: ssh

# Utilise rosetta for amd64 emulation (requires m1 mac and vmType `vz`)
# Default: false
rosetta: false

# Enable foreign architecture emulation via binfmt (e.g. amd64 on arm64, arm64 on amd64)
# Default: true
binfmt: true

# Enable nested virtualization for the virtual machine (requires m3 mac and vmType `vz`)
# Default: false
nestedVirtualization: false

# Volume mount driver for the virtual machine (virtiofs, 9p, sshfs).
#
# virtiofs is limited to macOS and vmType `vz`. It is the fastest of the options.
#
# 9p is the recommended and the most stable option for vmType `qemu`.
#
# sshfs is faster than 9p but the least reliable of the options (when there are lots
# of concurrent reads or writes).
#
# NOTE: value cannot be changed after virtual machine is created.
# Default: virtiofs (for vz), sshfs (for qemu)
mountType: virtiofs

# Propagate inotify file events to the VM.
# NOTE: this is experimental.
mountInotify: false

# The CPU type for the virtual machine (requires vmType `qemu`).
# Options available for host emulation can be checked with: `qemu-system-$(arch) -cpu help`.
# Instructions are also supported by appending to the cpu type e.g. "qemu64,+ssse3".
# Default: host
cpuType: ""

# Custom provision scripts for the virtual machine.
# Provisioning scripts are executed on startup and therefore needs to be idempotent.
#
# EXAMPLE - script executed as root
# provision:
#   - mode: system
#     script: apt-get install htop vim
#
# EXAMPLE - script executed as user
# provision:
#   - mode: user
#     script: |
#       [ -f ~/.provision ] && exit 0;
#       echo provisioning as $USER...
#       touch ~/.provision
#
# EXAMPLE - script executed after VM boot, before container runtimes start
# provision:
#   - mode: after-boot
#     script: echo "VM is up, containers not yet started"
#
# EXAMPLE - script executed after VM and container runtimes are ready
# provision:
#   - mode: ready
#     script: echo "everything is ready"
#
# Default: []
provision: null

# Modify ~/.ssh/config automatically to include a SSH config for the virtual machine.
# SSH config will still be generated in $COLIMA_HOME/ssh_config regardless.
# Default: true
sshConfig: true

# The port number for the SSH server for the virtual machine.
# When set to 0, a random available port is used.
#
# Default: 0
sshPort: 0

# Configure volume mounts for the virtual machine.
# Colima mounts user's home directory by default to provide a familiar
# user experience.
#
# EXAMPLE
# mounts:
#   - location: ~/secrets
#     writable: false
#   - location: ~/projects
#     writable: true
#
# Colima default behaviour: $HOME is mounted as writable.
# Default: []
mounts: []

# Specify a custom disk image for the virtual machine.
# When not specified, Colima downloads an appropriate disk image from Github at
# https://github.com/abiosoft/colima-core/releases.
# The file path to a custom disk image can be specified to override the behaviour.
#
# Default: ""
diskImage: ""

# Use the custom disk image even if it does NOT match a supported release image.
# WARNING: This bypasses validating the image and is a completely unsupported!
forceDiskImage: false

# Size of the disk in GiB for the root filesystem of the virtual machine.
# This value is ignored if no runtime is in use. i.e. `none` runtime.
# Default: 20
rootDisk: 20

# Environment variables for the virtual machine.
#
# EXAMPLE
# env:
#   KEY: value
#   ANOTHER_KEY: another value
#
# Default: {}
env: {}
NAME                      DESCRIPTION                               DOCKER ENDPOINT                                         ERROR
colima-yxt-permission *   colima [profile=yxt-permission]           unix:///Users/peng/.colima/yxt-permission/docker.sock   
default                   Current DOCKER_HOST based configuration   unix:///var/run/docker.sock                             
Client: Docker Engine - Community
 Version:    29.8.2
 Context:    colima-yxt-permission
 Debug Mode: false
 Plugins:
  buildx: Docker Buildx (Docker Inc.)
    Version:  v0.37.2
    Path:     /Users/peng/.docker/cli-plugins/docker-buildx

Server:
 Containers: 2
  Running: 2
  Paused: 0
  Stopped: 0
 Images: 10
 Server Version: 29.5.2
 Storage Driver: overlayfs
  driver-type: io.containerd.snapshotter.v1
 Logging Driver: json-file
 Cgroup Driver: cgroupfs
 Cgroup Version: 2
 Plugins:
  Volume: local
  Network: bridge host ipvlan macvlan null overlay
  Log: awslogs fluentd gcplogs gelf journald json-file local splunk syslog
 CDI spec directories:
  /etc/cdi
  /var/run/cdi
 Swarm: inactive
 Runtimes: io.containerd.runc.v2 runc
 Default Runtime: runc
 Init Binary: docker-init
 containerd version: 193637f7ee8ae5f5aa5248f49e7baa3e6164966e
 runc version: v1.3.5-0-g488fc13e
 init version: de40ad0
 Security Options:
  apparmor
  seccomp
   Profile: builtin
  cgroupns
 Kernel Version: 6.8.0-117-generic
 Operating System: Ubuntu 24.04.4 LTS
 OSType: linux
 Architecture: aarch64
 CPUs: 10
 Total Memory: 23.42GiB
 Name: colima-yxt-permission
 ID: 586b3552-2f97-4ad4-8492-952507e3111f
 Docker Root Dir: /var/lib/docker
 Debug Mode: false
 Experimental: false
 Insecure Registries:
  ::1/128
  127.0.0.0/8
 Live Restore Enabled: false
 Firewall Backend: iptables
  EnableUserlandProxy: true
  UserlandProxyPath: /usr/bin/docker-proxy

yxt-redis	c6eabf748fc7	Exited (255) 12 seconds ago
yxt-pg	639ab7ceb90e	Exited (255) 12 seconds ago
DRIVER    VOLUME NAME
local     c0a59a38192012094cf254770dab37b209286695abc4a9a9e4ec4179be749932
local     yxt-permission-pgdata
/Users/peng/Agent本地开发/云学堂权限预研
[
    {
        "Id": "eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059",
        "Created": "2026-09-22T19:16:45.598746843Z",
        "Path": "docker-entrypoint.sh",
        "Args": [
            "-c",
            "shared_buffers=2GB",
            "-c",
            "work_mem=16MB",
            "-c",
            "max_connections=160",
            "-c",
            "shared_preload_libraries=pg_stat_statements",
            "-c",
            "track_io_timing=on"
        ],
        "State": {
            "Status": "exited",
            "Running": false,
            "Paused": false,
            "Restarting": false,
            "OOMKilled": false,
            "Dead": false,
            "Pid": 0,
            "ExitCode": 255,
            "Error": "",
            "StartedAt": "2026-09-23T08:03:25.387123198Z",
            "FinishedAt": "2026-10-03T07:25:28.197942921Z"
        },
        "Image": "sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652",
        "ResolvConfPath": "/var/lib/docker/containers/eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059/resolv.conf",
        "HostnamePath": "/var/lib/docker/containers/eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059/hostname",
        "HostsPath": "/var/lib/docker/containers/eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059/hosts",
        "LogPath": "/var/lib/docker/containers/eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059/eadce11b7659c52055f65b4bba980a1675fbaa537852b530bd3a9c2ba63c7059-json.log",
        "Name": "/yxt-pg",
        "RestartCount": 0,
        "Driver": "overlayfs",
        "Platform": "linux",
        "MountLabel": "",
        "ProcessLabel": "",
        "AppArmorProfile": "docker-default",
        "ExecIDs": null,
        "HostConfig": {
            "Binds": null,
            "ContainerIDFile": "",
            "LogConfig": {
                "Type": "json-file",
                "Config": {}
            },
            "NetworkMode": "yxt-permission",
            "PortBindings": {
                "5432/tcp": [
                    {
                        "HostIp": "127.0.0.1",
                        "HostPort": "55432"
                    }
                ]
            },
            "RestartPolicy": {
                "Name": "no",
                "MaximumRetryCount": 0
            },
            "AutoRemove": false,
            "VolumeDriver": "",
            "VolumesFrom": null,
            "ConsoleSize": [
                0,
                0
            ],
            "CapAdd": null,
            "CapDrop": null,
            "CgroupnsMode": "private",
            "Dns": [],
            "DnsOptions": [],
            "DnsSearch": [],
            "ExtraHosts": null,
            "GroupAdd": null,
            "IpcMode": "private",
            "Cgroup": "",
            "Links": null,
            "OomScoreAdj": 0,
            "PidMode": "",
            "Privileged": false,
            "PublishAllPorts": false,
            "ReadonlyRootfs": false,
            "SecurityOpt": null,
            "UTSMode": "",
            "UsernsMode": "",
            "ShmSize": 1073741824,
            "Runtime": "runc",
            "Isolation": "",
            "CpuShares": 0,
            "Memory": 8589934592,
            "NanoCpus": 4000000000,
            "CgroupParent": "",
            "BlkioWeight": 0,
            "BlkioWeightDevice": [],
            "BlkioDeviceReadBps": [],
            "BlkioDeviceWriteBps": [],
            "BlkioDeviceReadIOps": [],
            "BlkioDeviceWriteIOps": [],
            "CpuPeriod": 0,
            "CpuQuota": 0,
            "CpuRealtimePeriod": 0,
            "CpuRealtimeRuntime": 0,
            "CpusetCpus": "",
            "CpusetMems": "",
            "Devices": [],
            "DeviceCgroupRules": null,
            "DeviceRequests": null,
            "MemoryReservation": 0,
            "MemorySwap": 8589934592,
            "MemorySwappiness": null,
            "OomKillDisable": null,
            "PidsLimit": null,
            "Ulimits": null,
            "CpuCount": 0,
            "CpuPercent": 0,
            "IOMaximumIOps": 0,
            "IOMaximumBandwidth": 0,
            "Mounts": [
                {
                    "Type": "volume",
                    "Source": "yxt-permission-pgdata",
                    "Target": "/var/lib/postgresql/data"
                }
            ],
            "MaskedPaths": [
                "/proc/acpi",
                "/proc/asound",
                "/proc/interrupts",
                "/proc/kcore",
                "/proc/keys",
                "/proc/latency_stats",
                "/proc/sched_debug",
                "/proc/scsi",
                "/proc/timer_list",
                "/proc/timer_stats",
                "/sys/devices/virtual/powercap",
                "/sys/firmware"
            ],
            "ReadonlyPaths": [
                "/proc/bus",
                "/proc/fs",
                "/proc/irq",
                "/proc/sys",
                "/proc/sysrq-trigger"
            ]
        },
        "Storage": {
            "RootFS": {
                "Snapshot": {
                    "Name": "overlayfs"
                }
            }
        },
        "Mounts": [
            {
                "Type": "volume",
                "Name": "yxt-permission-pgdata",
                "Source": "/var/lib/docker/volumes/yxt-permission-pgdata/_data",
                "Destination": "/var/lib/postgresql/data",
                "Driver": "local",
                "Mode": "z",
                "RW": true,
                "Propagation": ""
            }
        ],
        "Config": {
            "Hostname": "eadce11b7659",
            "Domainname": "",
            "User": "",
            "AttachStdin": false,
            "AttachStdout": false,
            "AttachStderr": false,
            "ExposedPorts": {
                "5432/tcp": {}
            },
            "Tty": false,
            "OpenStdin": false,
            "StdinOnce": false,
            "Env": [
                "POSTGRES_USER=spike",
                "POSTGRES_PASSWORD=spike",
                "POSTGRES_DB=permission_spike",
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
                "GOSU_VERSION=1.19",
                "LANG=en_US.utf8",
                "PG_MAJOR=17",
                "PG_VERSION=17.11-1.pgdg12+2",
                "PGDATA=/var/lib/postgresql/data"
            ],
            "Cmd": [
                "-c",
                "shared_buffers=2GB",
                "-c",
                "work_mem=16MB",
                "-c",
                "max_connections=160",
                "-c",
                "shared_preload_libraries=pg_stat_statements",
                "-c",
                "track_io_timing=on"
            ],
            "Image": "postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652",
            "Volumes": {
                "/var/lib/postgresql/data": {}
            },
            "WorkingDir": "",
            "Entrypoint": [
                "docker-entrypoint.sh"
            ],
            "Labels": {},
            "StopSignal": "SIGINT"
        },
        "NetworkSettings": {
            "SandboxID": "",
            "SandboxKey": "",
            "Ports": {},
            "Networks": {
                "yxt-permission": {
                    "IPAMConfig": null,
                    "Links": null,
                    "Aliases": null,
                    "DriverOpts": null,
                    "GwPriority": 0,
                    "NetworkID": "1ba12b71901bf5c6c877dec5a32d24dd31d5af1a5e7fe41419ee599bfeca6219",
                    "EndpointID": "",
                    "Gateway": "",
                    "IPAddress": "",
                    "MacAddress": "",
                    "IPPrefixLen": 0,
                    "IPv6Gateway": "",
                    "GlobalIPv6Address": "",
                    "GlobalIPv6PrefixLen": 0,
                    "DNSNames": [
                        "yxt-pg",
                        "eadce11b7659"
                    ]
                }
            }
        },
        "ImageManifestDescriptor": {
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "digest": "sha256:75731e2765e7d0c8bb7dea960ef3bdcde68d16314991ab2057a2a74ea0fff257",
            "size": 3643,
            "annotations": {
                "com.docker.official-images.bashbrew.arch": "arm64v8",
                "org.opencontainers.image.base.digest": "sha256:0c8bbb8e987a035fe1d9704eb2e571b7e9a836e1caa46345290674b45b69e417",
                "org.opencontainers.image.base.name": "debian:bookworm-slim",
                "org.opencontainers.image.created": "2026-09-19T00:38:52Z",
                "org.opencontainers.image.revision": "2603e26e245e558218728ee14e0a42dcb020dc7f",
                "org.opencontainers.image.source": "https://github.com/docker-library/postgres.git#2603e26e245e558218728ee14e0a42dcb020dc7f:17/bookworm",
                "org.opencontainers.image.url": "https://hub.docker.com/_/postgres",
                "org.opencontainers.image.version": "17.11-bookworm"
            },
            "platform": {
                "architecture": "arm64",
                "os": "linux",
                "variant": "v8"
            }
        }
    },
    {
        "Id": "a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7",
        "Created": "2026-09-22T19:16:45.74979704Z",
        "Path": "docker-entrypoint.sh",
        "Args": [
            "redis-server",
            "--maxmemory",
            "512mb",
            "--maxmemory-policy",
            "noeviction",
            "--appendonly",
            "no"
        ],
        "State": {
            "Status": "exited",
            "Running": false,
            "Paused": false,
            "Restarting": false,
            "OOMKilled": false,
            "Dead": false,
            "Pid": 0,
            "ExitCode": 255,
            "Error": "",
            "StartedAt": "2026-09-23T08:03:24.308259035Z",
            "FinishedAt": "2026-10-03T07:25:28.197977213Z"
        },
        "Image": "sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f",
        "ResolvConfPath": "/var/lib/docker/containers/a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7/resolv.conf",
        "HostnamePath": "/var/lib/docker/containers/a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7/hostname",
        "HostsPath": "/var/lib/docker/containers/a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7/hosts",
        "LogPath": "/var/lib/docker/containers/a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7/a0f04add5d30bce49dfa1b58a13ae4581270b33211a33cff6c972e5d15a853d7-json.log",
        "Name": "/yxt-redis",
        "RestartCount": 0,
        "Driver": "overlayfs",
        "Platform": "linux",
        "MountLabel": "",
        "ProcessLabel": "",
        "AppArmorProfile": "docker-default",
        "ExecIDs": null,
        "HostConfig": {
            "Binds": null,
            "ContainerIDFile": "",
            "LogConfig": {
                "Type": "json-file",
                "Config": {}
            },
            "NetworkMode": "yxt-permission",
            "PortBindings": {
                "6379/tcp": [
                    {
                        "HostIp": "127.0.0.1",
                        "HostPort": "56379"
                    }
                ]
            },
            "RestartPolicy": {
                "Name": "no",
                "MaximumRetryCount": 0
            },
            "AutoRemove": false,
            "VolumeDriver": "",
            "VolumesFrom": null,
            "ConsoleSize": [
                0,
                0
            ],
            "CapAdd": null,
            "CapDrop": null,
            "CgroupnsMode": "private",
            "Dns": [],
            "DnsOptions": [],
            "DnsSearch": [],
            "ExtraHosts": null,
            "GroupAdd": null,
            "IpcMode": "private",
            "Cgroup": "",
            "Links": null,
            "OomScoreAdj": 0,
            "PidMode": "",
            "Privileged": false,
            "PublishAllPorts": false,
            "ReadonlyRootfs": false,
            "SecurityOpt": null,
            "UTSMode": "",
            "UsernsMode": "",
            "ShmSize": 67108864,
            "Runtime": "runc",
            "Isolation": "",
            "CpuShares": 0,
            "Memory": 1073741824,
            "NanoCpus": 1000000000,
            "CgroupParent": "",
            "BlkioWeight": 0,
            "BlkioWeightDevice": [],
            "BlkioDeviceReadBps": [],
            "BlkioDeviceWriteBps": [],
            "BlkioDeviceReadIOps": [],
            "BlkioDeviceWriteIOps": [],
            "CpuPeriod": 0,
            "CpuQuota": 0,
            "CpuRealtimePeriod": 0,
            "CpuRealtimeRuntime": 0,
            "CpusetCpus": "",
            "CpusetMems": "",
            "Devices": [],
            "DeviceCgroupRules": null,
            "DeviceRequests": null,
            "MemoryReservation": 0,
            "MemorySwap": 1073741824,
            "MemorySwappiness": null,
            "OomKillDisable": null,
            "PidsLimit": null,
            "Ulimits": null,
            "CpuCount": 0,
            "CpuPercent": 0,
            "IOMaximumIOps": 0,
            "IOMaximumBandwidth": 0,
            "MaskedPaths": [
                "/proc/acpi",
                "/proc/asound",
                "/proc/interrupts",
                "/proc/kcore",
                "/proc/keys",
                "/proc/latency_stats",
                "/proc/sched_debug",
                "/proc/scsi",
                "/proc/timer_list",
                "/proc/timer_stats",
                "/sys/devices/virtual/powercap",
                "/sys/firmware"
            ],
            "ReadonlyPaths": [
                "/proc/bus",
                "/proc/fs",
                "/proc/irq",
                "/proc/sys",
                "/proc/sysrq-trigger"
            ]
        },
        "Storage": {
            "RootFS": {
                "Snapshot": {
                    "Name": "overlayfs"
                }
            }
        },
        "Mounts": [
            {
                "Type": "volume",
                "Name": "c0a59a38192012094cf254770dab37b209286695abc4a9a9e4ec4179be749932",
                "Source": "/var/lib/docker/volumes/c0a59a38192012094cf254770dab37b209286695abc4a9a9e4ec4179be749932/_data",
                "Destination": "/data",
                "Driver": "local",
                "Mode": "",
                "RW": true,
                "Propagation": ""
            }
        ],
        "Config": {
            "Hostname": "a0f04add5d30",
            "Domainname": "",
            "User": "",
            "AttachStdin": false,
            "AttachStdout": false,
            "AttachStderr": false,
            "ExposedPorts": {
                "6379/tcp": {}
            },
            "Tty": false,
            "OpenStdin": false,
            "StdinOnce": false,
            "Env": [
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "REDIS_VERSION=7.4.11"
            ],
            "Cmd": [
                "redis-server",
                "--maxmemory",
                "512mb",
                "--maxmemory-policy",
                "noeviction",
                "--appendonly",
                "no"
            ],
            "Image": "redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f",
            "Volumes": {
                "/data": {}
            },
            "WorkingDir": "/data",
            "Entrypoint": [
                "docker-entrypoint.sh"
            ],
            "Labels": {}
        },
        "NetworkSettings": {
            "SandboxID": "",
            "SandboxKey": "",
            "Ports": {},
            "Networks": {
                "yxt-permission": {
                    "IPAMConfig": null,
                    "Links": null,
                    "Aliases": null,
                    "DriverOpts": null,
                    "GwPriority": 0,
                    "NetworkID": "1ba12b71901bf5c6c877dec5a32d24dd31d5af1a5e7fe41419ee599bfeca6219",
                    "EndpointID": "",
                    "Gateway": "",
                    "IPAddress": "",
                    "MacAddress": "",
                    "IPPrefixLen": 0,
                    "IPv6Gateway": "",
                    "GlobalIPv6Address": "",
                    "GlobalIPv6PrefixLen": 0,
                    "DNSNames": [
                        "yxt-redis",
                        "a0f04add5d30"
                    ]
                }
            }
        },
        "ImageManifestDescriptor": {
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "digest": "sha256:cd953e4e9b4725f0d87a2b170c3d313ad641be5370033b46262e07f8010788a3",
            "size": 2290,
            "annotations": {
                "com.docker.official-images.bashbrew.arch": "arm64v8",
                "org.opencontainers.image.base.digest": "sha256:0c8bbb8e987a035fe1d9704eb2e571b7e9a836e1caa46345290674b45b69e417",
                "org.opencontainers.image.base.name": "debian:bookworm-slim",
                "org.opencontainers.image.created": "2026-09-19T00:40:41Z",
                "org.opencontainers.image.revision": "74654c612ee06275377d483dc4e134e57b463e9e",
                "org.opencontainers.image.source": "https://github.com/redis/docker-library-redis.git#74654c612ee06275377d483dc4e134e57b463e9e:debian",
                "org.opencontainers.image.url": "https://hub.docker.com/_/redis",
                "org.opencontainers.image.version": "7.4.11"
            },
            "platform": {
                "architecture": "arm64",
                "os": "linux",
                "variant": "v8"
            }
        }
    }
]
```

## 测量前环境记录原文

```text
2026-10-03T09:19:04Z
ProductName:		macOS
ProductVersion:		26.5.1
BuildVersion:		25F80
Apple M5 Pro
18
51539607552
Darwin zhipengdeMacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:12 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6050 arm64
colima 0.10.3
docker 29.8.2
node@24 24.21.0
python@3.14 3.14.8
v24.21.0
Python 3.14.8
PROFILE           STATUS     ARCH       CPUS    MEMORY    DISK     RUNTIME    ADDRESS
yxt-permission    Running    aarch64    10      24GiB     35GiB    docker     
Now drawing from 'AC Power'
 -InternalBattery-0 (id=23003235)	80%; AC attached; not charging present: true
yxt-redis	c6eabf748fc7	Up 7 minutes
yxt-pg	639ab7ceb90e	Up 7 minutes
817256bf1e1fc722aaa5f0c21878e84fe8df1306
```

## 窗口记录的服务实际版本与 PG 设置

### hot/runtime/api-node-version.txt

```text
v24.21.0
```

### hot/runtime/redis-version.txt

```text
Redis server v=7.4.11 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=30ac2daf18bf8899
```

### hot/runtime/postgresql-settings.json

```text
{"version" : "PostgreSQL 17.11 (Debian 17.11-1.pgdg12+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit", "database_collation" : "en_US.utf8", "database_ctype" : "en_US.utf8", "shared_buffers" : "2GB", "work_mem" : "16MB", "max_connections" : "160", "track_io_timing" : "on", "track_commit_timestamp" : "on", "statement_timeout" : "0"}
```

### hot/runtime/actual-data-counts.json

```text
{"main_people" : 50000, "second_people" : 500, "departments" : 2000, "roles" : 20, "load_facts" : 1000000, "actual_facts" : 1000002, "at" : "2026-10-03T09:26:22.14608+00:00"}
```

### cold/runtime/api-node-version.txt

```text
v24.21.0
```

### cold/runtime/redis-version.txt

```text
Redis server v=7.4.11 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=30ac2daf18bf8899
```

### cold/runtime/postgresql-settings.json

```text
{"version" : "PostgreSQL 17.11 (Debian 17.11-1.pgdg12+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit", "database_collation" : "en_US.utf8", "database_ctype" : "en_US.utf8", "shared_buffers" : "2GB", "work_mem" : "16MB", "max_connections" : "160", "track_io_timing" : "on", "track_commit_timestamp" : "on", "statement_timeout" : "0"}
```

### cold/runtime/actual-data-counts.json

```text
{"main_people" : 50000, "second_people" : 500, "departments" : 2000, "roles" : 20, "load_facts" : 1000000, "actual_facts" : 1000002, "at" : "2026-10-03T09:37:18.243492+00:00"}
```

