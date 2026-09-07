# Task ID: 2-d — CryoFlow 测试报告 + HPC 调度设计平台（单页应用）

> 注：沙箱根目录 `/` 不可写，无法创建全局 `/agent-ctx`，故将本代理工作记录保存在
> `/home/z/my-project/agent-ctx/`（与 worklog.md 同步）。后续代理可在此查看本记录。

## Agent
2-d（UI 平台子代理，Z.ai Code）

## Task
在 /home/z/my-project（Next.js 16 App Router + TS + Tailwind 4 + shadcn/ui）构建单页应用
（仅 / 路由）：CryoFlow 全面测试报告（5s 轮询主代理写入的 db/test-results.json）+
HPC/Slurm 架构设计展示 + 交互式多 GPU 调度模拟器 + SBATCH 生成器。

## Work Log（关键实现）
- 基础：`src/app/layout.tsx`（next-themes class 策略 + TanStack Query Provider + 中文 metadata）；
  `globals.css` 改为 teal/cyan 主色（oklch），自定义滚动条 `.nice-scroll`、hero 网格底纹、
  pending 软脉冲动画、iOS safe-area `.safe-bottom`、`scroll-padding-top` 锚点偏移。
- 数据契约：`src/lib/types.ts`（TestResults / Simulate / Sbatch 类型）；
  `src/lib/job-catalog.ts`（36 job 全量目录 = 26 SPA + 10 tomo，12 个类别徽章色系，
  mergeCatalog 用 live 数据覆盖 catalog pending 缺省）；`src/hooks/use-test-results.ts`
  （useQuery 5s refetchInterval + retry + placeholderData 保旧值防白屏）。
- API（仅 3 个，无其他路由）：
  - `GET /api/test-results`：服务端读 `/home/z/my-project/db/test-results.json`，
    文件缺失/半写入时返回空骨架（36 pending），no-store。
  - `POST /api/hpc/simulate`：`src/lib/hpc/simulator.ts` 纯 TS 事件驱动调度模拟——
    array 作业展开为共享 base jobId 的子任务（2_0…2_9）、依赖按 job-key 粒度
    （--dependency=afterok 语义，array 全部完成才算完成）、GPU 池按节点分配
    （单节点作业须同节点；跨节点 MPI 散射）、CPU 分区并发 = 分区数×10、
    A100=1.0×/H100=0.6× 时长、容量不足时返回 400 中文错误；输出 tasks+events+
    utilizationSeries+stats（makespan/GPU 利用率/平均排队/GPU·分钟）。zod 校验。
  - `POST /api/hpc/sbatch`：`src/lib/hpc/sbatch.ts` 6 个 job 类型模板
    （motioncorr-array / topaztrain / class2d / refine3d / class3d-screening / ctffind-array），
    Script.push(line, note) 保证注解行号 1-based 精确；含 #SBATCH 指令、module load、
    conda activate topaz、mpirun 绑卡（--gpu 0:1:2:3 / $(seq -s,)）、/lustre 日志、
    --requeue/--continue 容错、--dependency 占位。
- 页面（`src/app/page.tsx` 客户端组件，6 个 Section + sticky nav + sticky footer）：
  - S1 Hero：环境徽章卡 ×6、KPI 大数字 ×5（2/36 等）、测试进行中 banner（进度条 + 脉冲）。
  - S2 测试矩阵：12 类别 sticky 组头、36 行（status/level/耗时/产物/结果/命令），
    类别过滤 chips + 只看失败开关，行展开（命令/产物/日志 max-h-48 滚动），
    max-h-[72vh] nice-scroll，复制命令 toast。
  - S3 Topaz：依赖链 4 节点卡（RELION→relion_python_topaz→topaz CNN→torch CPU）、
    训练→模型→拾取 4 步数据流、topaztrain/autopick 动态结果卡（ModuleNotFoundError
    正则根因提取 + 修复路径说明）。
  - S4 HPC 架构：L1/L2/L3 三层图（纯 div/CSS，含 REST 与 ssh/sbatch 箭头标注）+
    6 组件卡（ExecutionBackend/SBATCH 生成/多 GPU 策略/数据流转/监控闭环/容错）。
  - S5 模拟器：左（集群滑杆+GPU 型号+分区数+队列 10 作业开关级联）→ Submit →
    右（6 统计卡、SVG Gantt 28 行、播放器 play/pause/1×/8×、白色遮罩渐进点亮、
    playhead、点击行看分配/等待原因、GPU 占用率 SVG 面积图、事件流自动滚、
    Slurm 语义映射卡）。
  - S6 SBATCH 生成器：类型下拉+分区/account/GPU/节点/时限/array 滑杆 → 生成 →
    39 行等宽代码（▲行号注解高亮）+ 右侧 14 条图例 + 复制按钮 toast。
- `scripts/dev-server.sh`：按 cryoflow 同款「脚本+setsid 立即退出」模式（端口 3000）。
- 修 lint 错误：useMounted 的 setState-in-effect → useSyncExternalStore 模式。

## 自查（agent-browser）
- 6 个 section id 全存在；KPI=2/36·0 real·2 native·2.0s；环境卡 ×6；矩阵 36 行 12 组头 13 chips。
- 行展开正常（import 行展开出命令+产物）；模拟器 Submit 后 28 Gantt 行、
  8× 速度 T+77、事件 130/139、运行/完成计数正确；SBATCH 生成 39 行/14 注解，
  复制按钮 toast 出现；5s 轮询实测 6.5s 内 +2 次请求；暗色切换 class 生效；
  移动端 390×844 导航横滚、KPI 2 列；锚点点击滚动到位；全新浏览器会话
  page errors: 0，console 干净（仅 HMR/DevTools info）；`bun run lint` 0 错误。
- 截图：tool-results/final-{hero,simulator,sbatch,matrix,dark}.png。

## Stage Summary
全部 6 个 Section + 3 个 API 完成，dev server 在 :3000 持续运行（保持不杀），
lint 0 错误、浏览器 0 error。数据契约与主代理对齐：test-results.json 增长时
矩阵/KPI/Topaz 卡自动点亮。遗留：Gantt 未画依赖箭头（用 tooltip + 事件流代替）；
模拟器无 backfill（notes 已注明）；数据库/Prisma 未使用（纯文件契约足够）。
