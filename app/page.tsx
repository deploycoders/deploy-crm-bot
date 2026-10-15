import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Target,
  TimerReset,
  TrendingUp,
} from "lucide-react";

const metrics = [
  {
    label: "Conversaciones Totales",
    value: "2,847",
    delta: "+18.2%",
    icon: MessageCircle,
  },
  {
    label: "Tasa de Respuesta",
    value: "94.8%",
    delta: "+6.4%",
    icon: TimerReset,
  },
  {
    label: "Prospectos Calificados",
    value: "418",
    delta: "+31",
    icon: Target,
  },
];

const conversations = [
  {
    name: "Mariana Fuentes",
    channel: "WhatsApp",
    intent: "Solicita demo del plan Pro",
    owner: "IA",
    status: "Atendido por IA",
    pill: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/25",
    icon: CheckCircle2,
  },
  {
    name: "Grupo Altamira",
    channel: "Webchat",
    intent: "Pregunta por facturacion anual",
    owner: "Sin asignar",
    status: "Esperando Asesor",
    pill: "bg-amber-400/12 text-amber-200 ring-amber-400/25",
    icon: Clock3,
  },
  {
    name: "Carlos Rivas",
    channel: "Instagram",
    intent: "Comparando precios",
    owner: "Laura",
    status: "Atendido por Humano",
    pill: "bg-sky-400/12 text-sky-200 ring-sky-400/25",
    icon: MessageCircle,
  },
  {
    name: "Inversiones Norte",
    channel: "WhatsApp",
    intent: "Quiere integrar CRM actual",
    owner: "Sin asignar",
    status: "Esperando Asesor",
    pill: "bg-amber-400/12 text-amber-200 ring-amber-400/25",
    icon: Clock3,
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-signal">Resumen ejecutivo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Dashboard de Ventas IA
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Supervisa conversaciones, detecta oportunidades de cierre y prioriza
            handoffs humanos en tiempo real.
          </p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-signal/30 bg-signal px-4 py-2.5 text-sm font-semibold text-ink shadow-glow transition hover:bg-emerald-300">
          Ver oportunidades
          <ArrowUpRight className="size-4" />
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="rounded-lg border border-line bg-white/[0.055] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {metric.value}
                </p>
              </div>
              <span className="grid size-11 place-items-center rounded-lg bg-signal/10 text-signal ring-1 ring-signal/25">
                <metric.icon className="size-5" />
              </span>
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-signal" />
              <span className="font-medium text-signal">{metric.delta}</span>
              <span className="text-slate-500">vs. semana anterior</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-lg border border-line bg-panel/70 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Conversaciones Recientes
              </h2>
              <p className="text-sm text-slate-400">
                Estados de lead sincronizados con el chatbot.
              </p>
            </div>
            <span className="rounded-full bg-white/7 px-3 py-1 text-xs text-slate-300">
              24h
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.035] text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium">Canal</th>
                  <th className="px-5 py-3 font-medium">Intencion</th>
                  <th className="px-5 py-3 font-medium">Responsable</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {conversations.map((conversation) => (
                  <tr key={conversation.name} className="hover:bg-white/[0.035]">
                    <td className="px-5 py-4 font-medium text-white">
                      {conversation.name}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {conversation.channel}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {conversation.intent}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      {conversation.owner}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${conversation.pill}`}
                      >
                        <conversation.icon className="size-3.5" />
                        {conversation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-line bg-white/[0.05] p-5 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">
            Prioridad de Handoff
          </h2>
          <div className="mt-5 space-y-4">
            {["Compra inmediata", "Demo solicitada", "Objecion de precio"].map(
              (item, index) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-lg border border-line bg-ink/45 px-4 py-3"
                >
                  <span className="text-sm text-slate-300">{item}</span>
                  <span className="text-sm font-semibold text-signal">
                    {18 - index * 5}
                  </span>
                </div>
              ),
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
