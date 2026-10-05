export default function Page() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">采集记录</h1>
      <p className="text-muted-foreground">
        尚未执行采集任务。后续显示采集数量、状态与错误。
      </p>
    </section>
  );
}
