import WizardCard from '@/components/wizard/WizardCard';
import { Calculator, Zap, Users, ArrowRight } from 'lucide-react';

export default function Wizard() {
  const isEmbed = ['1', 'true'].includes(
    new URLSearchParams(window.location.search).get('embed') || ''
  );

  if (isEmbed) {
    return (
      <div className="w-full">
        <WizardCard embed />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh">
      <div className="max-w-[1080px] mx-auto px-5 sm:px-8 pt-12 pb-16">
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-5" data-testid="badge-hero">
            <Zap className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-600 tracking-wide uppercase">AI-Powered Quote Builder</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" data-testid="text-wizard-title">
            <span className="text-slate-800">Build Your </span>
            <span className="text-gradient">Instant Quote System</span>
          </h1>
          <p className="text-base text-slate-500 max-w-md mx-auto leading-relaxed">
            Create a professional quote calculator in under 60 seconds. Embed it on your site and start capturing leads.
          </p>
        </div>

        <div className="animate-fade-in-up animation-delay-100">
          <WizardCard />
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-5 animate-fade-in-up animation-delay-300">
          {[
            { icon: Calculator, title: 'AI Pricing', desc: 'Smart pricing questions generated for your trade' },
            { icon: Users, title: 'Lead Capture', desc: 'Collect contact info with every quote request' },
            { icon: ArrowRight, title: 'Embed Anywhere', desc: 'Add your calculator to any website in seconds' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3.5 p-5 rounded-xl bg-white/60 border border-slate-200/60" data-testid={`feature-card-${i}`}>
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4.5 h-4.5 text-indigo-500" style={{ width: '18px', height: '18px' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-0.5">{item.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
