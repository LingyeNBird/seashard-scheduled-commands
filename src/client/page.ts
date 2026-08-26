import type { ClientServerSelection } from "./ui-sdk-compat";
import { defineComponent, h } from "vue";
import type {
  CommandSchedule,
  ScheduledCommandTask,
  ScheduledCommandsService,
  SchedulerSnapshot,
} from "../shared/contract";

type ScheduleMode = "delay" | "once" | "daily" | "weekly";
type DelayUnit = "minutes" | "hours" | "days";

type FormState = {
  name: string;
  command: string;
  scheduleMode: ScheduleMode;
  delayValue: number;
  delayUnit: DelayUnit;
  runAt: string;
  time: string;
  weekdays: number[];
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"] as const;
const delayMultiplier: Record<DelayUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function createScheduledCommandsPage(
  service: ScheduledCommandsService,
  serverSelection: ClientServerSelection,
) {
  return defineComponent({
    name: "ScheduledCommandsPage",
    data() {
      return {
        instanceId: serverSelection.getCurrentInstanceId() as string | undefined,
        snapshot: undefined as SchedulerSnapshot | undefined,
        loading: false,
        error: "",
        feedback: "",
        formVisible: false,
        editingTaskId: undefined as string | undefined,
        deleteConfirmationId: undefined as string | undefined,
        busyTasks: new Set<string>(),
        formBusy: false,
        form: freshForm(),
        requestSequence: 0,
        refreshTimer: undefined as ReturnType<typeof setInterval> | undefined,
        selectionDisposer: undefined as (() => void | Promise<void>) | undefined,
      };
    },
    computed: {
      enabledCount(): number {
        return this.snapshot?.tasks.filter((task) => task.enabled).length ?? 0;
      },
      nextTask(): ScheduledCommandTask | undefined {
        return this.snapshot?.tasks.find((task) => task.enabled && task.nextRunAt);
      },
    },
    methods: {
      async load(showLoading = true): Promise<void> {
        const instanceId = this.instanceId;
        const requestId = ++this.requestSequence;
        this.error = "";
        if (!instanceId) {
          this.snapshot = undefined;
          this.loading = false;
          return;
        }
        if (showLoading) this.loading = true;
        try {
          const result = await service.listTasks({ instanceId });
          if (requestId === this.requestSequence && this.instanceId === instanceId) {
            this.snapshot = result;
          }
        } catch (cause) {
          if (requestId === this.requestSequence) this.error = errorMessage(cause);
        } finally {
          if (requestId === this.requestSequence) this.loading = false;
        }
      },
      selectInstance(instanceId: string | undefined): void {
        if (
          this.instanceId === instanceId &&
          (this.loading || this.snapshot !== undefined || this.error !== "")
        ) {
          return;
        }
        this.instanceId = instanceId;
        this.snapshot = undefined;
        this.closeForm();
        this.deleteConfirmationId = undefined;
        this.feedback = "";
        void this.load();
      },
      openCreateForm(): void {
        Object.assign(this.form, freshForm());
        this.editingTaskId = undefined;
        this.formVisible = true;
        this.feedback = "";
        this.error = "";
      },
      openEditForm(task: ScheduledCommandTask): void {
        Object.assign(this.form, formFromTask(task));
        this.editingTaskId = task.id;
        this.formVisible = true;
        this.feedback = "";
        this.error = "";
      },
      closeForm(): void {
        this.formVisible = false;
        this.editingTaskId = undefined;
      },
      async submitForm(): Promise<void> {
        const instanceId = this.instanceId;
        if (!instanceId || this.formBusy) return;
        this.formBusy = true;
        this.error = "";
        this.feedback = "";
        try {
          const schedule = scheduleFromForm(this.form);
          const base = {
            instanceId,
            name: this.form.name,
            command: this.form.command,
            schedule,
          };
          if (this.editingTaskId) {
            await service.updateTask({ ...base, taskId: this.editingTaskId });
            this.feedback = "任务已更新";
          } else {
            await service.createTask(base);
            this.feedback = "任务已创建";
          }
          this.closeForm();
          await this.load(false);
        } catch (cause) {
          this.error = errorMessage(cause);
        } finally {
          this.formBusy = false;
        }
      },
      async toggleTask(task: ScheduledCommandTask): Promise<void> {
        const instanceId = this.instanceId;
        if (!instanceId || this.busyTasks.has(task.id)) return;
        this.busyTasks.add(task.id);
        this.error = "";
        try {
          await service.setTaskEnabled({ instanceId, taskId: task.id, enabled: !task.enabled });
          this.feedback = task.enabled ? "任务已停用" : "任务已启用";
          await this.load(false);
        } catch (cause) {
          this.error = errorMessage(cause);
        } finally {
          this.busyTasks.delete(task.id);
        }
      },
      async runTask(task: ScheduledCommandTask): Promise<void> {
        const instanceId = this.instanceId;
        if (!instanceId || this.busyTasks.has(task.id)) return;
        this.busyTasks.add(task.id);
        this.error = "";
        this.feedback = "";
        try {
          const result = await service.runTaskNow({ instanceId, taskId: task.id });
          this.feedback =
            result.status === "succeeded"
              ? "命令已发送"
              : `执行失败：${result.error ?? "未知错误"}`;
          await this.load(false);
        } catch (cause) {
          this.error = errorMessage(cause);
        } finally {
          this.busyTasks.delete(task.id);
        }
      },
      async deleteTask(task: ScheduledCommandTask): Promise<void> {
        const instanceId = this.instanceId;
        if (!instanceId || this.busyTasks.has(task.id)) return;
        this.busyTasks.add(task.id);
        this.error = "";
        try {
          await service.deleteTask({ instanceId, taskId: task.id });
          this.deleteConfirmationId = undefined;
          this.feedback = "任务已删除";
          await this.load(false);
        } catch (cause) {
          this.error = errorMessage(cause);
        } finally {
          this.busyTasks.delete(task.id);
        }
      },
      setDeleteConfirmation(taskId: string | undefined): void {
        this.deleteConfirmationId = taskId;
      },
    },
    mounted() {
      this.selectionDisposer = serverSelection.subscribe((instanceId) => {
        this.selectInstance(instanceId);
      });
      this.refreshTimer = setInterval(() => {
        if (!this.formBusy && this.busyTasks.size === 0) void this.load(false);
      }, 15_000);
    },
    beforeUnmount() {
      this.requestSequence += 1;
      if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      void this.selectionDisposer?.();
      this.selectionDisposer = undefined;
    },
    render() {
      return h("main", { class: "sc-page", "aria-labelledby": "sc-page-title" }, [
        h("header", { class: "sc-header" }, [
          h("div", [
            h("h1", { id: "sc-page-title", class: "sc-title" }, "定时任务"),
            h(
              "p",
              { class: "sc-subtitle" },
              this.snapshot
                ? ["当前服务器：", h("span", { class: "sc-server-name" }, this.snapshot.instance.name)]
                : "命令由 Host 调度，并在发送前验证服务器实例和运行状态。",
            ),
          ]),
          h("div", { class: "sc-toolbar" }, [
            h(
              "button",
              {
                class: "sc-button sc-button-primary",
                type: "button",
                disabled: !this.instanceId,
                onClick: this.openCreateForm,
              },
              "新建任务",
            ),
          ]),
        ]),
        this.feedback
          ? h("div", { class: "sc-alert sc-alert-success", role: "status" }, this.feedback)
          : null,
        this.error ? h("div", { class: "sc-alert sc-alert-error", role: "alert" }, this.error) : null,
        !this.instanceId
          ? emptyState(
              "未选择服务器",
              "请先在 SeaShard 服务器工作区选择一个实例。切换实例后，本页会自动显示对应任务。",
            )
          : null,
        this.instanceId && this.loading && !this.snapshot ? loadingState() : null,
        this.instanceId && this.snapshot
          ? [
              h("section", { class: "sc-panel sc-summary", "aria-label": "任务摘要" }, [
                summaryItem("任务总数", String(this.snapshot.tasks.length)),
                summaryItem("已启用", String(this.enabledCount)),
                summaryItem(
                  "下次执行",
                  this.nextTask?.nextRunAt ? formatDateTime(this.nextTask.nextRunAt) : "暂无计划",
                ),
              ]),
              this.formVisible
                ? renderForm(
                    this.form,
                    this.editingTaskId,
                    this.formBusy,
                    this.closeForm,
                    this.submitForm,
                  )
                : null,
              this.snapshot.tasks.length === 0
                ? h("section", { class: "sc-panel" }, [
                    emptyState(
                      "还没有定时任务",
                      `在 ${this.snapshot.hostTimeZone} 时区创建延时、每日或每周命令。`,
                      h(
                        "button",
                        {
                          class: "sc-button sc-button-primary sc-empty-action",
                          type: "button",
                          onClick: this.openCreateForm,
                        },
                        "创建第一个任务",
                      ),
                    ),
                  ])
                : renderTaskList(
                    this.snapshot.tasks,
                    this.busyTasks,
                    this.deleteConfirmationId,
                    this.toggleTask,
                    this.runTask,
                    this.openEditForm,
                    this.deleteTask,
                    this.setDeleteConfirmation,
                  ),
            ]
          : null,
      ]);
    },
  });
}

function renderForm(
  form: FormState,
  editingTaskId: string | undefined,
  busy: boolean,
  close: () => void,
  submit: () => Promise<void>,
) {
  return h("form", { class: "sc-panel sc-form", onSubmit: (event: Event) => { event.preventDefault(); void submit(); } }, [
    h("div", { class: "sc-form-heading" }, [
      h("h2", { class: "sc-form-title" }, editingTaskId ? "编辑任务" : "新建任务"),
      h("button", { class: "sc-button sc-button-quiet", type: "button", onClick: close }, "取消"),
    ]),
    h("div", { class: "sc-form-grid" }, [
      field("任务名称", h("input", inputProps(form.name, "例如：每日保存", 80, (value) => { form.name = value; }))),
      field(
        "计划类型",
        h(
          "select",
          {
            class: "sc-select",
            value: form.scheduleMode,
            onChange: (event: Event) => { form.scheduleMode = (event.target as HTMLSelectElement).value as ScheduleMode; },
          },
          [
            option("delay", "延时执行"),
            option("once", "指定时间执行一次"),
            option("daily", "每天固定时间"),
            option("weekly", "每周固定时间"),
          ],
        ),
      ),
      field(
        "服务器命令",
        h("textarea", {
          class: "sc-textarea",
          value: form.command,
          maxlength: 512,
          placeholder: "例如：say 服务器将在十分钟后重启",
          onInput: (event: Event) => { form.command = (event.target as HTMLTextAreaElement).value; },
        }),
        "不要包含换行符；发送时不会自动添加斜杠。",
        true,
      ),
      renderScheduleFields(form),
    ]),
    h("div", { class: "sc-form-actions" }, [
      h("button", { class: "sc-button", type: "button", onClick: close }, "取消"),
      h(
        "button",
        { class: "sc-button sc-button-primary", type: "submit", disabled: busy },
        busy ? "正在保存" : editingTaskId ? "保存修改" : "创建任务",
      ),
    ]),
  ]);
}

function renderScheduleFields(form: FormState) {
  if (form.scheduleMode === "delay") {
    return field(
      "延时",
      h("div", { class: "sc-inline-fields" }, [
        h("input", {
          class: "sc-input",
          type: "number",
          min: 1,
          max: 10080,
          step: 1,
          value: form.delayValue,
          onInput: (event: Event) => { form.delayValue = Number((event.target as HTMLInputElement).value); },
        }),
        h(
          "select",
          {
            class: "sc-select",
            value: form.delayUnit,
            onChange: (event: Event) => { form.delayUnit = (event.target as HTMLSelectElement).value as DelayUnit; },
          },
          [option("minutes", "分钟"), option("hours", "小时"), option("days", "天")],
        ),
      ]),
      "从点击创建任务时开始计时。",
      true,
    );
  }
  if (form.scheduleMode === "once") {
    return field(
      "执行时间",
      h("input", {
        class: "sc-input",
        type: "datetime-local",
        value: form.runAt,
        onInput: (event: Event) => { form.runAt = (event.target as HTMLInputElement).value; },
      }),
      "使用 SeaShard Host 所在机器的本地时间。",
      true,
    );
  }
  if (form.scheduleMode === "daily") {
    return field(
      "每天执行时间",
      h("input", {
        class: "sc-input",
        type: "time",
        value: form.time,
        onInput: (event: Event) => { form.time = (event.target as HTMLInputElement).value; },
      }),
      "按 Host 本地时区计算下次执行时间。",
      true,
    );
  }
  return field(
    "每周执行时间",
    h("div", [
      h("div", { class: "sc-weekdays", role: "group", "aria-label": "选择星期" },
        weekdayLabels.map((label, day) =>
          h(
            "button",
            {
              class: "sc-weekday",
              type: "button",
              "aria-pressed": form.weekdays.includes(day),
              onClick: () => {
                form.weekdays = form.weekdays.includes(day)
                  ? form.weekdays.filter((value) => value !== day)
                  : [...form.weekdays, day].sort((left, right) => left - right);
              },
            },
            label,
          ),
        ),
      ),
      h("input", {
        class: "sc-input",
        style: "margin-top: 10px",
        type: "time",
        value: form.time,
        onInput: (event: Event) => { form.time = (event.target as HTMLInputElement).value; },
      }),
    ]),
    "至少选择一个星期。",
    true,
  );
}

function renderTaskList(
  tasks: readonly ScheduledCommandTask[],
  busyTasks: Set<string>,
  deleteConfirmationId: string | undefined,
  toggleTask: (task: ScheduledCommandTask) => Promise<void>,
  runTask: (task: ScheduledCommandTask) => Promise<void>,
  editTask: (task: ScheduledCommandTask) => void,
  deleteTask: (task: ScheduledCommandTask) => Promise<void>,
  setDeleteConfirmation: (taskId: string | undefined) => void,
) {
  return h("section", { class: "sc-panel", "aria-label": "定时任务列表" }, [
    h(
      "ul",
      { class: "sc-list" },
      tasks.map((task) =>
        h("li", { class: "sc-task", key: task.id }, [
          h("div", { class: "sc-task-main" }, [
            h("div", [
              h("div", { class: "sc-task-heading" }, [
                h("h2", { class: "sc-task-name" }, task.name),
                h(
                  "span",
                  { class: ["sc-status", task.enabled ? "sc-status-enabled" : ""] },
                  task.enabled ? "已启用" : "已停用",
                ),
              ]),
              h("code", { class: "sc-command" }, task.command),
              h("div", { class: "sc-task-meta" }, [
                h("span", formatSchedule(task.schedule)),
                h("span", task.nextRunAt ? `下次：${formatDateTime(task.nextRunAt)}` : "暂无下次执行"),
                task.lastExecution
                  ? h(
                      "span",
                      `最近：${executionLabel(task.lastExecution.status)} · ${formatDateTime(task.lastExecution.finishedAt ?? task.lastExecution.startedAt)}`,
                    )
                  : null,
              ]),
              task.lastExecution?.error
                ? h("p", { class: "sc-task-error" }, task.lastExecution.error)
                : null,
            ]),
            h("div", { class: "sc-task-actions" }, [
              h(
                "button",
                {
                  class: "sc-button sc-button-quiet",
                  type: "button",
                  disabled: busyTasks.has(task.id),
                  onClick: () => { void runTask(task); },
                },
                "立即执行",
              ),
              h(
                "button",
                {
                  class: "sc-button sc-button-quiet",
                  type: "button",
                  disabled: busyTasks.has(task.id),
                  onClick: () => { void toggleTask(task); },
                },
                task.enabled ? "停用" : "启用",
              ),
              h("button", { class: "sc-button sc-button-quiet", type: "button", onClick: () => editTask(task) }, "编辑"),
              h(
                "button",
                {
                  class: "sc-button sc-button-quiet sc-button-danger",
                  type: "button",
                  onClick: () => { setDeleteConfirmation(task.id); },
                },
                "删除",
              ),
            ]),
          ]),
          deleteConfirmationId === task.id
            ? h("div", { class: "sc-confirm" }, [
                h("span", "删除后无法恢复。"),
                h(
                  "button",
                  {
                    class: "sc-button sc-button-danger",
                    type: "button",
                    disabled: busyTasks.has(task.id),
                    onClick: () => { void deleteTask(task); },
                  },
                  "确认删除",
                ),
                h(
                  "button",
                  { class: "sc-button sc-button-quiet", type: "button", onClick: () => { setDeleteConfirmation(undefined); } },
                  "取消",
                ),
              ])
            : null,
        ]),
      ),
    ),
  ]);
}

function freshForm(): FormState {
  return {
    name: "",
    command: "",
    scheduleMode: "delay",
    delayValue: 30,
    delayUnit: "minutes",
    runAt: toDateTimeLocal(new Date(Date.now() + 3_600_000).toISOString()),
    time: "04:00",
    weekdays: [1],
  };
}

function formFromTask(task: ScheduledCommandTask): FormState {
  const form = freshForm();
  form.name = task.name;
  form.command = task.command;
  if (task.schedule.kind === "once") {
    form.scheduleMode = "once";
    form.runAt = toDateTimeLocal(task.schedule.runAt);
  } else if (task.schedule.kind === "daily") {
    form.scheduleMode = "daily";
    form.time = task.schedule.time;
  } else {
    form.scheduleMode = "weekly";
    form.time = task.schedule.time;
    form.weekdays = [...task.schedule.weekdays];
  }
  return form;
}

function scheduleFromForm(form: FormState): CommandSchedule {
  if (form.scheduleMode === "delay") {
    if (!Number.isFinite(form.delayValue) || form.delayValue < 1) throw new RangeError("延时必须大于零");
    return {
      kind: "once",
      runAt: new Date(Date.now() + form.delayValue * delayMultiplier[form.delayUnit]).toISOString(),
    };
  }
  if (form.scheduleMode === "once") {
    const runAt = new Date(form.runAt);
    if (!form.runAt || !Number.isFinite(runAt.getTime())) throw new TypeError("请选择有效执行时间");
    return { kind: "once", runAt: runAt.toISOString() };
  }
  if (!form.time) throw new TypeError("请选择执行时间");
  if (form.scheduleMode === "daily") return { kind: "daily", time: form.time };
  if (form.weekdays.length === 0) throw new TypeError("每周任务至少选择一个星期");
  return { kind: "weekly", time: form.time, weekdays: [...form.weekdays] };
}

function field(label: string, control: ReturnType<typeof h>, help?: string, wide = false) {
  return h("label", { class: ["sc-field", wide ? "sc-field-wide" : ""] }, [
    h("span", { class: "sc-label" }, label),
    control,
    help ? h("span", { class: "sc-help" }, help) : null,
  ]);
}

function inputProps(value: string, placeholder: string, maxlength: number, update: (value: string) => void) {
  return {
    class: "sc-input",
    value,
    placeholder,
    maxlength,
    onInput: (event: Event) => update((event.target as HTMLInputElement).value),
  };
}

function option(value: string, label: string) {
  return h("option", { value }, label);
}

function summaryItem(label: string, value: string) {
  return h("div", { class: "sc-summary-item" }, [
    h("span", { class: "sc-summary-label" }, label),
    h("strong", { class: "sc-summary-value" }, value),
  ]);
}

function emptyState(title: string, copy: string, action?: ReturnType<typeof h>) {
  return h("section", { class: "sc-empty" }, [
    h("h2", { class: "sc-empty-title" }, title),
    h("p", { class: "sc-empty-copy" }, copy),
    action ?? null,
  ]);
}

function loadingState() {
  return h("section", { class: "sc-panel sc-skeleton", "aria-label": "正在加载任务" }, [
    h("div", { class: "sc-skeleton-line" }),
    h("div", { class: "sc-skeleton-line" }),
    h("div", { class: "sc-skeleton-line" }),
  ]);
}

function formatSchedule(schedule: CommandSchedule): string {
  if (schedule.kind === "once") return `单次：${formatDateTime(schedule.runAt)}`;
  if (schedule.kind === "daily") return `每天 ${schedule.time}`;
  return `每周${schedule.weekdays.map((day) => weekdayLabels[day]).join("、")} ${schedule.time}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function executionLabel(status: "running" | "succeeded" | "failed"): string {
  if (status === "running") return "执行中";
  return status === "succeeded" ? "成功" : "失败";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
