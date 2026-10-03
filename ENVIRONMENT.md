# Round 2 remediation 91683df：环境与执行事实

测量提交：91683df702182724dbe9025afa5726606ba3d340，detached HEAD。
证据目录：round2-remediation-91683df/。本说明由 Codex 在用户完成测量后生成。执行脚本 run-remediation.sh 原文随证据提交。

## 执行方式、异常与阶段时间

测量由用户在“终端”App 中执行。用户说明：第一次写入脚本时，因 zsh 的 ! 历史展开（shebang 行）和误贴代码框标记失败，改用不含 shebang 的脚本后成功。当前 run-remediation.sh 首行为 set -u，没有 shebang；上述首次写入失败经过来自用户陈述，本目录没有该次终端错误的独立日志。
脚本按 hot、cold、regression 顺序调用原脚本，然后执行 regression-summary 汇总。各阶段时间原文来自 *-start-utc.txt 和 *-end-utc.txt，表示阶段脚本开始与结束，不换算成负载时长。

| 阶段 | 开始 UTC | 结束 UTC |
|---|---|---|
| hot | 2026-10-03T13:28:58Z | 2026-10-03T13:41:57Z |
| cold | 2026-10-03T13:41:57Z | 2026-10-03T13:52:48Z |
| regression | 2026-10-03T13:52:48Z | 2026-10-03T13:54:27Z |

run-remediation.sh 固定 PATH 为 /opt/homebrew/opt/node@24/bin，并核验 HEAD 和工作区干净后执行。脚本自身没有 caffeinate -dims；终端外层是否使用 caffeinate、测量期间接电源与机器独占情况未另存记录。
本轮交回证据没有运行窗口、回归、汇总脚本，没有启动或停止 Docker/Colima，没有修改源码、SQL、脚本、依赖锁或已生成的证据文件。未发现 incomplete.txt。退出码、window-gate.json 和 regression-summary.json 保留原文，不作性能判断。

## 本机环境与记录来源

本机只读采集时间：2026-10-03T14:02:38.079016+00:00，在测量结束后采集，不能作为测量期间逐时环境记录。
macOS 26.5.1，BuildVersion 25F80；Apple M5 Pro；18 逻辑 CPU；物理内存 51539607552 字节（48 GiB）。Node v24.21.0；Homebrew node@24 24.21.0、python@3.14 3.14.8、colima 0.10.3、docker CLI 29.8.2。
读取 ~/.colima/yxt-permission/colima.yaml：vmType vz、cpu 10、memory 24 GiB、disk 35 GiB、arch aarch64、runtime docker。完整只读输出与配置见附录。
两个窗口 runtime/containers.json 是测量期间实际容器配置记录：PG 镜像 postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652，4 CPU / 8589934592 字节；Redis 镜像 redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f，1 CPU / 1073741824 字节；两个 API 各 2 CPU / 4294967296 字节。
两个窗口实际 PG 为 PostgreSQL 17.11（Debian 17.11-1.pgdg12+2，aarch64），Redis 7.4.11，API Node v24.21.0。PG 设置 shared_buffers=2GB、work_mem=16MB、max_connections=160、track_io_timing=on、track_commit_timestamp=on、statement_timeout=0；完整原文见附录。
先前基线第三节的 Docker Server 29.5.2、VM Ubuntu 24.04.4 LTS / Linux 6.8.0-117-generic / aarch64、Docker info 10 CPU / 23.42 GiB 是先前记录，附录明确标为历史参考；本轮未重新执行 Docker info，不将历史记录当作本次新增观测。
未修改规划仓库 yunxuetang-replica-planning，也未读取或修改旧预研目录的业务内容。

## 镜像构建、已知差异和异常

本目录没有 prebuild.txt；hot/build.txt 记录了热窗脚本构建 API 镜像。没有本次手工预构建的独立证据。镜像 tag 为 yxt-permission:spike-91683df70218，label org.opencontainers.image.revision=91683df702182724dbe9025afa5726606ba3d340；cold/build.txt 不存在，冷窗容器记录使用同一 tag 和提交标签。
测量提交 tools/run-native-window.sh 固定构建参数 HTTP_PROXY=http://192.168.5.2:7890、HTTPS_PROXY=http://192.168.5.2:7890、NO_PROXY=localhost,127.0.0.1,yxt-pg,yxt-redis，构建上下文为该测量提交目录。hot/build.txt 记录 manifest list digest sha256:8072b257723c04f910cf6f29e706c5b4cff0e0e6d182ce8e90740543bb8f10a7。
先前基线已记录 PG 容器创建于 17ed824 之前，命令行缺少 -c track_commit_timestamp=on；第 1 轮通过 ALTER SYSTEM 开启，用户授权该差异允许复用。本次 pg-ready.txt 为 accepting connections，track-commit-timestamp-check.txt 及两个窗口 runtime/postgresql-settings.json 均记录 on。本轮没有执行 enable-commit-timestamps.sh。
本机只读核对的硬件、系统、Node 和 Colima 参数与指令参考值一致。其他参考版本值未提供，不推断差异。已知执行差异为用户终端执行、不含 shebang 的脚本、首次写入失败，以及脚本自身未包装 caffeinate；外层防睡眠和测量独占情况没有独立记录。先前基线的 nohup 失败和基础设施首次启动时序异常属于先前基线，不作为本次异常重述。

## 完整包、文件指纹与入库范围

MANIFEST.json 列出本目录全部普通文件的相对路径、字节数和 SHA-256；符号链接记录 target 和目标字符串的字节数与 SHA-256，不跟随链接。MANIFEST.json 唯一自引用排除，其最终字节数和 SHA-256 写入包外 ARCHIVE.json。
完整包 round2-remediation-91683df.tar.gz 保留整个目录，包括原始未压缩日志、回归隔离源码快照和 node_modules 符号链接；不解引用链接。包保存在本机。包外元数据保存在 evidence/raw/round2-remediation-91683df-ARCHIVE.json，并以 ARCHIVE.json 放在证据分支根目录。
孤儿分支 evidence/round2-remediation-91683df 根目录放 ENVIRONMENT.md、MANIFEST.json、ARCHIVE.json；执行脚本原文作为执行证据入库。regression/workspace 中除 evidence/raw 原始产物之外的自动归档源码、说明、配置、依赖锁和依赖符号链接只保留在完整包，清单逐项标注未入库。
四个原始 API 日志大于 50,000,000 字节。原文件保持原样；在包外临时发布目录生成 gzip 副本，入库路径及副本 SHA-256 写入 MANIFEST.json 的 repository_artifact。副本不加入原始证据目录；完整包保留原日志。gzip 副本解压后的字节数及 SHA-256 与原文件核对。压缩后超过 95,000,000 字节则不入库。

| 原文件 | 原始字节数 | gzip 入库路径 | 压缩字节数 |
|---|---:|---|---:|
| cold/yxt-api-a.log | 141608300 | cold/yxt-api-a.log.gz | 21848468 |
| cold/yxt-api-b.log | 142479469 | cold/yxt-api-b.log.gz | 22289629 |
| hot/yxt-api-a.log | 127171266 | hot/yxt-api-a.log.gz | 19199501 |
| hot/yxt-api-b.log | 127042059 | hot/yxt-api-b.log.gz | 19109974 |

## 测量后本机只读输出

```text
$ sw_vers
ProductName:		macOS
ProductVersion:		26.5.1
BuildVersion:		25F80
$ sysctl -n machdep.cpu.brand_string hw.ncpu hw.memsize
Apple M5 Pro
18
51539607552
$ uname -a
Darwin zhipengdeMacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:12 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6050 arm64
$ brew list --versions node@24 python3 colima docker
colima 0.10.3
docker 29.8.2
node@24 24.21.0
python@3.14 3.14.8
$ /opt/homebrew/opt/node@24/bin/node --version
v24.21.0
$ /opt/homebrew/bin/python3 --version
Python 3.14.8
$ colima version
colima version 0.10.3
git commit: 00f6c297e92a82c04a4ab507db0a61435650d7e8
$ docker --version
Docker version 29.8.2, build 7fc2dff9bc
```

## 测量后读取的 Colima 配置

```yaml
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
```

## 先前基线第三节完整记录（历史参考）

以下是先前基线 existing-environment.txt 原文，采集于本次整改测量之前；保留第三节记录的完整实际值、Docker context/info、卷与容器配置来源，不代表本次重新采集。

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

## 本次就绪与收尾原文

### pg-ready.txt

```text
/var/run/postgresql:5432 - accepting connections
```

### track-commit-timestamp-check.txt

```text
on
```

### final-head.txt

```text
91683df702182724dbe9025afa5726606ba3d340
```

### final-git-status.txt

```text
```

### final-docker-ps.txt

```text
CONTAINER ID   IMAGE          COMMAND                   CREATED       STATUS         PORTS                       NAMES
a0f04add5d30   c6eabf748fc7   "docker-entrypoint.s…"   10 days ago   Up 9 seconds   127.0.0.1:56379->6379/tcp   yxt-redis
eadce11b7659   639ab7ceb90e   "docker-entrypoint.s…"   10 days ago   Up 8 seconds   127.0.0.1:55432->5432/tcp   yxt-pg
```

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
{"main_people" : 50000, "second_people" : 500, "departments" : 2000, "roles" : 20, "load_facts" : 1000000, "actual_facts" : 1000002, "at" : "2026-10-03T13:31:27.663637+00:00"}
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
{"main_people" : 50000, "second_people" : 500, "departments" : 2000, "roles" : 20, "load_facts" : 1000000, "actual_facts" : 1000002, "at" : "2026-10-03T13:42:18.976211+00:00"}
```

