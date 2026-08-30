# workers

耗时任务异步执行入口（规划使用 Redis + BullMQ）。

当前初始化阶段：

- 不安装 BullMQ
- 不连接 Redis
- 不注册任何队列或处理器
