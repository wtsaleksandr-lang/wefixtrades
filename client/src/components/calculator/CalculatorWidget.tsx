import { useState, useMemo, useEffect } from 'react';
import { getWidgetTheme } from '@/theme/widgetTheme';
import { Loader2, PartyPopper, AlertCircle, ChevronLeft, ArrowRight, CheckCircle2, Plus, Minus, Phone, CalendarDays, Clock, ChevronRight, Shield, Star, MessageCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { calculateEstimate } from '@shared/calculateEstimate';
import { validatePricingConfig, FAMILY_LABELS } from '@shared/pricingConfig';
import type { PricingConfigV1, AddOn, DifficultyTier } from '@shared/pricingConfig';
import type { EstimateInputs, EstimateResult } from '@shared/calculateEstimate';
import { getTemplateById } from '@shared/templateLibrary';
import type { TemplateDefinition } from '@shared/templateLibrary';
import { getSliderConfig, shouldUseSlider } from '@shared/sliderMappings';
import SliderField from './SliderField';

interface CalculatorData {
  id: number;
  slug: string;
  business_name: string;
  tagline?: string;
  logo_url?: string;
  primary_color?: string;
  pricing_config: any;
  theme_overrides?: any;
  cta_button_text?: string;
  lead_thank_you_message?: string;
  calculator_settings?: any;
}

interface CalculatorWidgetProps {
  calculator: CalculatorData;
  isEmbed?: boolean;
}

export default function CalculatorWidget({ calculator, isEmbed = false }: CalculatorWidgetProps) {
  const theme = getWidgetTheme(calculator.theme_overrides, calculator.primary_color);
  const accentColor = theme.colors.primary;

  const validation = useMemo(() => validatePricingConfig(calculator.pricing_config), [calculator.pricing_config]);
  const config = validation.config;

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedTierIndex, setSelectedTierIndex] = useState<number>(0);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string>("");
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '', company: '' });
  const [multiStepIndex, setMultiStepIndex] = useState(0);

  const [showBookingPanel, setShowBookingPanel] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingData, setConfirmedBookingData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [bookingCustomer, setBookingCustomer] = useState({ name: '', email: '', phone: '' });

  const calcSettings = calculator.calculator_settings || {};
  const bookingSettings = calcSettings.booking_settings || {};
  const isBookingEnabled = calcSettings.calculator_type === 'estimate_plus_booking' && bookingSettings.enabled;
  const workingDays: string[] = bookingSettings.availability?.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'];

  const uiTemplate = calcSettings.ui_template || {};
  const templateId: string = uiTemplate.template_id || 'classic_single';
  const templateDef = getTemplateById(templateId);
  const layoutStyle: string = uiTemplate.layout?.style || templateDef?.layout_style || 'single_page';
  const useSliders: boolean = uiTemplate.inputs?.use_sliders !== false;
  const sliderDefaults = uiTemplate.inputs?.slider_defaults || {};
  const showBreakdown: boolean = uiTemplate.layout?.show_breakdown !== false;
  const showTrustBlock: boolean = uiTemplate.layout?.show_trust_block === true;
  const showTestimonials: boolean = uiTemplate.layout?.show_testimonials === true;
  const stickySummary: boolean = uiTemplate.layout?.sticky_summary === true;

  useEffect(() => {
    if (!selectedDate || !calculator.id) return;
    setLoadingSlots(true);
    setSelectedTime('');
    fetch(`/api/bookings/availability?calculator_id=${calculator.id}&date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        setAvailableSlots(data.slots || []);
        setLoadingSlots(false);
      })
      .catch(() => {
        setAvailableSlots([]);
        setLoadingSlots(false);
      });
  }, [selectedDate, calculator.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('booking_confirmed') === '1') {
      setBookingConfirmed(true);
      setConfirmedBookingData({
        date: params.get('booking_date') || '',
        time: params.get('booking_time') || '',
        name: params.get('booking_name') || '',
        quote_amount: params.get('booking_quote') ? Number(params.get('booking_quote')) : undefined,
        deposit_amount: params.get('booking_deposit') ? Number(params.get('booking_deposit')) : undefined,
      });
    }
  }, []);

  const inputs: EstimateInputs = {
    quantity,
    selectedTierIndex,
    selectedAddOnIds,
    selectedDifficultyId: selectedDifficultyId || undefined,
    isAfterHours,
  };

  const estimate = useMemo(() => calculateEstimate(config, inputs), [config, quantity, selectedTierIndex, selectedAddOnIds, selectedDifficultyId, isAfterHours]);

  const depositInfo = useMemo(() => {
    if (!bookingSettings.require_deposit) return null;
    const type = bookingSettings.deposit_type || 'fixed';
    const value = bookingSettings.deposit_value || 0;
    if (type === 'percentage' && estimate) {
      return { amount: Math.round(estimate.total * value / 100), label: `${value}% deposit` };
    }
    return { amount: value, label: `$${value} deposit` };
  }, [bookingSettings, estimate]);

  const toggleAddOn = (id: string) => {
    setSelectedAddOnIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const leadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads', {
        calculator_id: calculator.id,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        company: leadData.company,
        quote_amount: estimate.total,
        answers: { pricingType: config.pricingType, quantity, selectedTierIndex, selectedAddOnIds, selectedDifficultyId, isAfterHours },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit.');
      return data;
    },
    onSuccess: () => setLeadSubmitted(true),
  });

  const bookingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/bookings', {
        calculator_id: calculator.id,
        customer_name: bookingCustomer.name,
        customer_email: bookingCustomer.email || undefined,
        customer_phone: bookingCustomer.phone || undefined,
        date: selectedDate,
        time: selectedTime,
        quote_amount: estimate.total,
      });
      return await res.json();
    },
    onSuccess: async (data) => {
      if (data.requires_checkout && data.booking?.id) {
        const checkoutRes = await apiRequest('POST', `/api/bookings/${data.booking.id}/checkout`, {});
        const checkoutData = await checkoutRes.json();
        if (checkoutData.checkout_url) {
          window.location.href = checkoutData.checkout_url;
          return;
        }
      }
      setConfirmedBookingData(data.booking);
      setBookingConfirmed(true);
      setShowBookingPanel(false);
    },
  });

  const submitting = leadMutation.isPending;
  const submitError = leadMutation.error ? (leadMutation.error as Error).message : null;

  const containerStyle: React.CSSProperties = {
    maxWidth: isEmbed ? '100%' : (layoutStyle === 'two_column' ? '960px' : '640px'),
    margin: isEmbed ? '0' : '0 auto',
    fontFamily: theme.typography?.fontFamily || 'Inter, system-ui, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: theme.colors.surface,
    borderRadius: '20px',
    boxShadow: isEmbed ? 'none' : '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '15px',
    borderRadius: '12px', border: 'none',
    background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
    color: 'white', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    boxShadow: `0 4px 16px ${accentColor}30`,
    transition: 'all 0.2s ease', letterSpacing: '0.01em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  if (bookingConfirmed) {
    const bd = confirmedBookingData;
    const dateStr = bd?.date ? new Date(bd.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const timeStr = bd?.time ? formatTime12(bd.time) : '';
    return (
      <div style={containerStyle}>
        <div className="animate-scale-in" style={{ ...cardStyle, padding: '48px 32px', textAlign: 'center' }}>
          <div className="animate-checkmark" style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 8px 30px ${accentColor}30` }}>
            <CalendarDays style={{ width: '36px', height: '36px', color: 'white' }} />
          </div>
          <h2 data-testid="text-booking-confirmed" style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.heading, marginBottom: '10px' }}>
            Booking Confirmed
          </h2>
          <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.8 }}>
            {dateStr && <><strong style={{ color: theme.colors.heading }}>{dateStr}</strong><br /></>}
            {timeStr && <><strong style={{ color: theme.colors.heading }}>{timeStr}</strong><br /></>}
            {bd?.quote_amount != null && (
              <>Estimated quote: <strong style={{ color: accentColor, fontSize: '18px' }}>${bd.quote_amount.toLocaleString()}</strong><br /></>
            )}
            {bd?.deposit_amount != null && bd?.deposit_amount > 0 && (
              <>Deposit paid: <strong style={{ color: theme.colors.success || accentColor }}>${bd.deposit_amount.toLocaleString()}</strong></>
            )}
          </p>
          <p style={{ fontSize: '13px', color: theme.colors.muted, marginTop: '16px' }}>
            A confirmation email has been sent. We look forward to seeing you!
          </p>
        </div>
      </div>
    );
  }

  if (leadSubmitted) {
    return (
      <div style={containerStyle}>
        <div className="animate-scale-in" style={{ ...cardStyle, padding: '48px 32px', textAlign: 'center' }}>
          <div className="animate-checkmark" style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 8px 30px ${accentColor}30` }}>
            <PartyPopper style={{ width: '36px', height: '36px', color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.heading, marginBottom: '10px' }}>
            {calculator.lead_thank_you_message || "Thanks! We'll be in touch soon."}
          </h2>
          {estimate.type === "exact" && (
            <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.6 }}>
              Your estimated quote: <strong style={{ color: accentColor, fontSize: '18px' }}>${estimate.total.toLocaleString()}</strong>
            </p>
          )}
          {estimate.type === "range" && (
            <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.6 }}>
              Estimated range: <strong style={{ color: accentColor, fontSize: '18px' }}>${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (showBookingPanel) {
    return (
      <BookingPanel
        containerStyle={containerStyle}
        cardStyle={cardStyle}
        btnPrimary={btnPrimary}
        labelStyle={labelStyle}
        theme={theme}
        accentColor={accentColor}
        estimate={estimate}
        depositInfo={depositInfo}
        calendarMonth={calendarMonth}
        setCalendarMonth={setCalendarMonth}
        workingDays={workingDays}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        availableSlots={availableSlots}
        loadingSlots={loadingSlots}
        bookingCustomer={bookingCustomer}
        setBookingCustomer={setBookingCustomer}
        bookingMutation={bookingMutation}
        onBack={() => setShowBookingPanel(false)}
      />
    );
  }

  if (showLeadForm) {
    return (
      <LeadFormPanel
        containerStyle={containerStyle}
        cardStyle={cardStyle}
        btnPrimary={btnPrimary}
        labelStyle={labelStyle}
        theme={theme}
        accentColor={accentColor}
        estimate={estimate}
        calculator={calculator}
        leadData={leadData}
        setLeadData={setLeadData}
        leadMutation={leadMutation}
        submitting={submitting}
        submitError={submitError}
        onBack={() => setShowLeadForm(false)}
      />
    );
  }

  if (showResult && estimate.type !== "call_for_quote") {
    return (
      <ResultPanel
        containerStyle={containerStyle}
        cardStyle={cardStyle}
        btnPrimary={btnPrimary}
        theme={theme}
        accentColor={accentColor}
        estimate={estimate}
        calculator={calculator}
        isBookingEnabled={isBookingEnabled}
        showBreakdown={showBreakdown}
        onGetQuote={() => setShowLeadForm(true)}
        onBookNow={() => setShowBookingPanel(true)}
        onStartOver={() => { setShowResult(false); setQuantity(1); setSelectedTierIndex(0); setSelectedAddOnIds([]); setSelectedDifficultyId(""); setIsAfterHours(false); }}
      />
    );
  }

  const pricingInputsProps = {
    config, quantity, setQuantity, selectedTierIndex, setSelectedTierIndex,
    selectedAddOnIds, toggleAddOn, selectedDifficultyId, setSelectedDifficultyId,
    isAfterHours, setIsAfterHours, theme, accentColor, useSliders, sliderDefaults,
  };

  const headerBlock = !isEmbed ? (
    <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '28px' }}>
      {calculator.logo_url && <img src={calculator.logo_url} alt={calculator.business_name} style={{ height: '48px', margin: '0 auto 14px', objectFit: 'contain' }} />}
      <h2 style={{ fontSize: '26px', fontWeight: 700, color: theme.colors.heading, letterSpacing: '-0.01em' }}>{calculator.business_name}</h2>
      {calculator.tagline && <p style={{ fontSize: '15px', color: theme.colors.muted, marginTop: '4px' }}>{calculator.tagline}</p>}
    </div>
  ) : null;

  const trustBlock = showTrustBlock ? (
    <div data-testid="trust-block" style={{ padding: '16px', borderRadius: '12px', background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.borderLight}`, marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Shield style={{ width: '16px', height: '16px', color: accentColor }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.heading }}>Trusted & Verified</span>
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: theme.colors.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 style={{ width: '12px', height: '12px', color: theme.colors.success }} /> Licensed & Insured
        </span>
        <span style={{ fontSize: '12px', color: theme.colors.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 style={{ width: '12px', height: '12px', color: theme.colors.success }} /> Satisfaction Guaranteed
        </span>
        <span style={{ fontSize: '12px', color: theme.colors.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Star style={{ width: '12px', height: '12px', color: '#F59E0B' }} /> 5-Star Rated
        </span>
      </div>
    </div>
  ) : null;

  const testimonialsBlock = showTestimonials ? (
    <div data-testid="testimonials-block" style={{ padding: '16px', borderRadius: '12px', background: theme.colors.surfaceRaised, border: `1px solid ${theme.colors.borderLight}`, marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <MessageCircle style={{ width: '14px', height: '14px', color: accentColor }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.heading }}>What Our Customers Say</span>
      </div>
      <div style={{ fontSize: '13px', color: theme.colors.body, fontStyle: 'italic', lineHeight: 1.5 }}>
        "Excellent service! The estimate was accurate and the work was completed on time."
      </div>
      <div style={{ fontSize: '11px', color: theme.colors.muted, marginTop: '6px' }}>— Satisfied Customer</div>
    </div>
  ) : null;

  const liveEstimateBlock = (
    <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {estimate.type === "range" ? "Estimated Range" : "Live Estimate"}
        </span>
        <span data-testid="text-live-estimate" style={{ fontSize: '24px', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>
          {estimate.type === "range"
            ? `$${estimate.rangeMin?.toLocaleString()} – $${estimate.rangeMax?.toLocaleString()}`
            : `$${estimate.total.toLocaleString()}`}
        </span>
      </div>
      {showBreakdown && estimate.breakdown.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: `1px solid ${accentColor}15`, paddingTop: '10px' }}>
          {estimate.breakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.colors.muted, padding: '3px 0' }}>
              <span>{item.label}</span>
              <span style={{ fontWeight: 500 }}>{item.amount > 0 ? `$${item.amount.toLocaleString()}` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const rangeOnlyBlock = (
    <div style={{ marginTop: '20px', padding: '24px', borderRadius: '12px', background: `${accentColor}08`, border: `1px solid ${accentColor}20`, textAlign: 'center' }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
        Estimated Range
      </span>
      <span data-testid="text-live-estimate" style={{ fontSize: '32px', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>
        {estimate.type === "range"
          ? `$${estimate.rangeMin?.toLocaleString()} – $${estimate.rangeMax?.toLocaleString()}`
          : `$${estimate.total.toLocaleString()}`}
      </span>
      <p style={{ fontSize: '13px', color: theme.colors.muted, marginTop: '10px' }}>
        Contact us for an exact quote tailored to your project
      </p>
    </div>
  );

  const ctaButton = (
    <button
      data-testid="button-see-breakdown"
      onClick={() => setShowResult(true)}
      style={{ ...btnPrimary, marginTop: '16px' }}
    >
      See Full Breakdown
      <ArrowRight style={{ width: '18px', height: '18px' }} />
    </button>
  );

  const bookingCtaEmphasis = templateDef?.features?.booking_cta_emphasis && isBookingEnabled;

  const callForQuoteBlock = (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <Phone style={{ width: '40px', height: '40px', color: accentColor, margin: '0 auto 12px' }} />
      <p style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.heading, marginBottom: '16px' }}>
        {(config as any).message || "Request a quote"}
      </p>
      <button data-testid="button-get-quote" onClick={() => setShowLeadForm(true)} style={btnPrimary}>
        {calculator.cta_button_text || 'Request a Quote'}
        <ArrowRight style={{ width: '18px', height: '18px' }} />
      </button>
    </div>
  );

  const isCallForQuote = config.pricingType === "call_for_quote_only";
  const isRangeOnlyLeadGate = templateId === 'range_only_leadgate';
  const isPackageSelector = templateId === 'package_selector';

  if (layoutStyle === 'two_column') {
    return (
      <div style={containerStyle}>
        {headerBlock}
        <div className="animate-fade-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '24px 28px 28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }} className="two-col-layout">
              <style>{`@media (min-width: 640px) { .two-col-layout { grid-template-columns: 1fr 320px !important; } }`}</style>
              <div>
                <PricingInputs {...pricingInputsProps} />
                {!isCallForQuote && trustBlock}
                {!isCallForQuote && testimonialsBlock}
              </div>
              <div>
                <div style={stickySummary ? { position: 'sticky', top: '20px' } : undefined}>
                  {isCallForQuote ? callForQuoteBlock : (
                    <>
                      {liveEstimateBlock}
                      {bookingCtaEmphasis ? (
                        <>
                          <button
                            data-testid="button-book-now"
                            onClick={() => setShowBookingPanel(true)}
                            style={{
                              ...btnPrimary,
                              marginTop: '16px',
                              fontSize: '18px',
                              padding: '18px',
                              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                              boxShadow: `0 6px 24px ${accentColor}40`,
                            }}
                          >
                            <CalendarDays style={{ width: '20px', height: '20px' }} />
                            Book Now
                          </button>
                          <button
                            data-testid="button-see-breakdown"
                            onClick={() => setShowResult(true)}
                            style={{
                              ...btnPrimary,
                              marginTop: '10px',
                              background: 'transparent',
                              color: accentColor,
                              border: `2px solid ${accentColor}`,
                              boxShadow: 'none',
                            }}
                          >
                            See Full Breakdown
                            <ArrowRight style={{ width: '18px', height: '18px' }} />
                          </button>
                        </>
                      ) : (
                        <>
                          {ctaButton}
                          {isBookingEnabled && (
                            <button
                              data-testid="button-book-now"
                              onClick={() => setShowBookingPanel(true)}
                              style={{
                                ...btnPrimary,
                                marginTop: '10px',
                                background: 'transparent',
                                color: accentColor,
                                border: `2px solid ${accentColor}`,
                                boxShadow: 'none',
                              }}
                            >
                              <CalendarDays style={{ width: '18px', height: '18px' }} />
                              Book Now
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (layoutStyle === 'multi_step') {
    const steps = buildMultiSteps(config, pricingInputsProps);
    const totalSteps = steps.length;
    const currentStep = Math.min(multiStepIndex, totalSteps - 1);
    const isLastStep = currentStep === totalSteps - 1;
    const progressPct = totalSteps > 1 ? ((currentStep + 1) / totalSteps) * 100 : 100;

    return (
      <div style={containerStyle}>
        {headerBlock}
        <div className="animate-fade-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '24px 28px 28px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Step {currentStep + 1} of {totalSteps}
                </span>
                <span style={{ fontSize: '12px', color: theme.colors.muted }}>{Math.round(progressPct)}%</span>
              </div>
              <div style={{ height: '4px', borderRadius: '2px', background: theme.colors.borderLight }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColor}dd)`,
                  width: `${progressPct}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            <div className="animate-fade-in" key={currentStep}>
              {steps[currentStep]?.content}
            </div>

            {stickySummary && !isCallForQuote && (
              <div style={{ position: 'sticky', bottom: '0', background: theme.colors.surface, paddingTop: '12px', borderTop: `1px solid ${theme.colors.borderLight}`, marginTop: '16px' }}>
                {liveEstimateBlock}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              {currentStep > 0 && (
                <button
                  data-testid="button-step-prev"
                  onClick={() => setMultiStepIndex(prev => Math.max(0, prev - 1))}
                  style={{
                    ...btnPrimary,
                    flex: '0 0 auto',
                    width: 'auto',
                    padding: '12px 20px',
                    background: 'transparent',
                    color: theme.colors.muted,
                    border: `1px solid ${theme.colors.border}`,
                    boxShadow: 'none',
                  }}
                >
                  <ChevronLeft style={{ width: '16px', height: '16px' }} /> Back
                </button>
              )}
              {!isLastStep ? (
                <button
                  data-testid="button-step-next"
                  onClick={() => setMultiStepIndex(prev => Math.min(totalSteps - 1, prev + 1))}
                  style={{ ...btnPrimary, flex: 1 }}
                >
                  Continue <ArrowRight style={{ width: '18px', height: '18px' }} />
                </button>
              ) : isCallForQuote ? (
                callForQuoteBlock
              ) : (
                <>
                  {!stickySummary && liveEstimateBlock}
                  {ctaButton}
                </>
              )}
            </div>

            {trustBlock}
            {testimonialsBlock}
          </div>
        </div>
      </div>
    );
  }

  if (isPackageSelector && config.pricingType === 'tiered_packages' && config.tiers?.length > 0) {
    return (
      <div style={containerStyle}>
        {headerBlock}
        <div className="animate-fade-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '24px 28px 28px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: theme.colors.heading, marginBottom: '16px', textAlign: 'center' }}>
              Choose Your Package
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`, gap: '12px' }}>
              {config.tiers.map((tier, idx) => {
                const isSelected = selectedTierIndex === idx;
                const isMiddle = config.tiers.length === 3 && idx === 1;
                return (
                  <button
                    key={idx}
                    data-testid={`option-tier-${idx}`}
                    onClick={() => setSelectedTierIndex(idx)}
                    style={{
                      padding: '24px 18px',
                      borderRadius: '16px',
                      border: `2px solid ${isSelected ? accentColor : theme.colors.border}`,
                      background: isSelected ? `${accentColor}08` : theme.colors.surface,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? `0 4px 16px ${accentColor}20` : '0 1px 4px rgba(0,0,0,0.04)',
                      position: 'relative',
                    }}
                  >
                    {isMiddle && (
                      <div style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        background: accentColor, color: 'white', fontSize: '10px', fontWeight: 700,
                        padding: '3px 10px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        Most Popular
                      </div>
                    )}
                    <div style={{ fontSize: '15px', fontWeight: 600, color: isSelected ? accentColor : theme.colors.heading, marginBottom: '8px' }}>
                      {tier.label}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: isSelected ? accentColor : theme.colors.heading, letterSpacing: '-0.02em' }}>
                      ${tier.price.toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>

            <PricingInputsNoQuantityNoTiers
              config={config}
              selectedAddOnIds={selectedAddOnIds}
              toggleAddOn={toggleAddOn}
              selectedDifficultyId={selectedDifficultyId}
              setSelectedDifficultyId={setSelectedDifficultyId}
              isAfterHours={isAfterHours}
              setIsAfterHours={setIsAfterHours}
              theme={theme}
              accentColor={accentColor}
            />

            {liveEstimateBlock}
            {ctaButton}
            {isBookingEnabled && (
              <button
                data-testid="button-book-now"
                onClick={() => setShowBookingPanel(true)}
                style={{
                  ...btnPrimary,
                  marginTop: '10px',
                  background: 'transparent',
                  color: accentColor,
                  border: `2px solid ${accentColor}`,
                  boxShadow: 'none',
                }}
              >
                <CalendarDays style={{ width: '18px', height: '18px' }} />
                Book Now
              </button>
            )}
            {trustBlock}
            {testimonialsBlock}
          </div>
        </div>
      </div>
    );
  }

  if (isRangeOnlyLeadGate) {
    return (
      <div style={containerStyle}>
        {headerBlock}
        <div className="animate-fade-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '24px 28px 28px' }}>
            {isCallForQuote ? callForQuoteBlock : (
              <>
                <PricingInputs {...pricingInputsProps} />
                {rangeOnlyBlock}
                <button
                  data-testid="button-get-quote"
                  onClick={() => setShowLeadForm(true)}
                  style={{ ...btnPrimary, marginTop: '16px' }}
                >
                  Get My Exact Quote
                  <ArrowRight style={{ width: '18px', height: '18px' }} />
                </button>
                {isBookingEnabled && (
                  <button
                    data-testid="button-book-now"
                    onClick={() => setShowBookingPanel(true)}
                    style={{
                      ...btnPrimary,
                      marginTop: '10px',
                      background: 'transparent',
                      color: accentColor,
                      border: `2px solid ${accentColor}`,
                      boxShadow: 'none',
                    }}
                  >
                    <CalendarDays style={{ width: '18px', height: '18px' }} />
                    Schedule a Consultation
                  </button>
                )}
                {trustBlock}
                {testimonialsBlock}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {headerBlock}
      <div className="animate-fade-in" style={cardStyle}>
        <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <PricingInputs {...pricingInputsProps} />

          {isCallForQuote ? callForQuoteBlock : (
            <>
              {liveEstimateBlock}
              {ctaButton}
              {isBookingEnabled && (
                <button
                  data-testid="button-book-now"
                  onClick={() => setShowBookingPanel(true)}
                  style={{
                    ...btnPrimary,
                    marginTop: '10px',
                    background: 'transparent',
                    color: accentColor,
                    border: `2px solid ${accentColor}`,
                    boxShadow: 'none',
                  }}
                >
                  <CalendarDays style={{ width: '18px', height: '18px' }} />
                  Book Now
                </button>
              )}
            </>
          )}
          {trustBlock}
          {testimonialsBlock}
        </div>
      </div>
    </div>
  );
}

function buildMultiSteps(config: PricingConfigV1, props: any): { label: string; content: JSX.Element }[] {
  const steps: { label: string; content: JSX.Element }[] = [];

  const needsQuantity = ["hourly", "per_unit", "per_sqft", "per_linear_ft", "base_plus_rate", "tiered_ranges"].includes(config.pricingType);
  const hasTiers = config.pricingType === "tiered_packages" && config.tiers?.length > 0;
  const hasAddOns = "addOns" in config && (config as any).addOns?.length > 0;
  const hasDifficultyTiers = "difficultyTiers" in config && (config as any).difficultyTiers?.length > 0;
  const hasAfterHours = "afterHoursMult" in config && (config as any).afterHoursMult > 1;
  const unitLabel = "unitName" in config ? (config as any).unitName : "units";

  if (needsQuantity) {
    steps.push({
      label: 'Quantity',
      content: (
        <QuantityInput
          quantity={props.quantity}
          setQuantity={props.setQuantity}
          unitLabel={unitLabel}
          theme={props.theme}
          accentColor={props.accentColor}
          useSliders={props.useSliders}
          sliderDefaults={props.sliderDefaults}
          config={config}
        />
      ),
    });
  }

  if (hasTiers && config.pricingType === "tiered_packages") {
    steps.push({
      label: 'Package',
      content: (
        <TierSelector
          config={config}
          selectedTierIndex={props.selectedTierIndex}
          setSelectedTierIndex={props.setSelectedTierIndex}
          theme={props.theme}
          accentColor={props.accentColor}
        />
      ),
    });
  }

  if (hasDifficultyTiers || hasAfterHours) {
    steps.push({
      label: 'Options',
      content: (
        <OptionsInput
          config={config}
          selectedDifficultyId={props.selectedDifficultyId}
          setSelectedDifficultyId={props.setSelectedDifficultyId}
          isAfterHours={props.isAfterHours}
          setIsAfterHours={props.setIsAfterHours}
          hasDifficultyTiers={hasDifficultyTiers}
          hasAfterHours={hasAfterHours}
          theme={props.theme}
          accentColor={props.accentColor}
        />
      ),
    });
  }

  if (hasAddOns) {
    steps.push({
      label: 'Add-Ons',
      content: (
        <AddOnsInput
          config={config}
          selectedAddOnIds={props.selectedAddOnIds}
          toggleAddOn={props.toggleAddOn}
          theme={props.theme}
          accentColor={props.accentColor}
        />
      ),
    });
  }

  if (steps.length === 0) {
    steps.push({
      label: 'Estimate',
      content: <p style={{ fontSize: '14px', color: props.theme.colors.muted }}>Configure your estimate below.</p>,
    });
  }

  return steps;
}

interface PricingInputsProps {
  config: PricingConfigV1;
  quantity: number;
  setQuantity: (n: number) => void;
  selectedTierIndex: number;
  setSelectedTierIndex: (n: number) => void;
  selectedAddOnIds: string[];
  toggleAddOn: (id: string) => void;
  selectedDifficultyId: string;
  setSelectedDifficultyId: (id: string) => void;
  isAfterHours: boolean;
  setIsAfterHours: (v: boolean) => void;
  theme: any;
  accentColor: string;
  useSliders?: boolean;
  sliderDefaults?: any;
}

function PricingInputs({
  config, quantity, setQuantity, selectedTierIndex, setSelectedTierIndex,
  selectedAddOnIds, toggleAddOn, selectedDifficultyId, setSelectedDifficultyId,
  isAfterHours, setIsAfterHours, theme, accentColor, useSliders = true, sliderDefaults = {}
}: PricingInputsProps) {
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  const needsQuantity = ["hourly", "per_unit", "per_sqft", "per_linear_ft", "base_plus_rate", "tiered_ranges"].includes(config.pricingType);
  const hasAddOns = "addOns" in config && (config as any).addOns?.length > 0;
  const hasDifficultyTiers = "difficultyTiers" in config && (config as any).difficultyTiers?.length > 0;
  const hasAfterHours = "afterHoursMult" in config && (config as any).afterHoursMult > 1;
  const hasTiers = config.pricingType === "tiered_packages" && config.tiers?.length > 0;

  const unitLabel = "unitName" in config ? (config as any).unitName : "units";

  if (config.pricingType === "call_for_quote_only" || config.pricingType === "price_range_only") {
    return null;
  }

  const sliderConfig = getSliderConfig(unitLabel);
  const showSlider = useSliders && sliderConfig !== null && needsQuantity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {needsQuantity && (
        showSlider && sliderConfig ? (
          <SliderField
            label={`How many ${unitLabel}${unitLabel !== "hour" ? "" : "s"} do you need?`}
            value={quantity}
            min={sliderConfig.min}
            max={sliderConfig.max}
            step={sliderDefaults.step || sliderConfig.step}
            unitSuffix={sliderConfig.unitSuffix}
            showValueBubble={sliderDefaults.show_value_bubble !== false}
            showMinMaxLabels={sliderDefaults.show_min_max_labels !== false}
            onChange={setQuantity}
            accentColor={accentColor}
          />
        ) : (
          <div>
            <label style={labelStyle}>
              How many {unitLabel}{unitLabel !== "hour" ? "" : "s"} do you need?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                data-testid="button-qty-minus"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
              </button>
              <input
                data-testid="input-quantity"
                type="number"
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="premium-input"
                style={{ width: '80px', textAlign: 'center', padding: '10px', borderRadius: '10px', fontSize: '16px', fontWeight: 600 }}
              />
              <button
                data-testid="button-qty-plus"
                onClick={() => setQuantity(quantity + 1)}
                style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
              </button>
              <span style={{ fontSize: '14px', color: theme.colors.muted }}>{unitLabel}</span>
            </div>
          </div>
        )
      )}

      {hasTiers && config.pricingType === "tiered_packages" && (
        <TierSelector config={config} selectedTierIndex={selectedTierIndex} setSelectedTierIndex={setSelectedTierIndex} theme={theme} accentColor={accentColor} />
      )}

      {hasDifficultyTiers && (
        <div>
          <label style={labelStyle}>Complexity level</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {((config as any).difficultyTiers as DifficultyTier[]).map(tier => {
              const isSelected = selectedDifficultyId === tier.id;
              return (
                <button
                  key={tier.id}
                  data-testid={`option-difficulty-${tier.id}`}
                  onClick={() => setSelectedDifficultyId(isSelected ? "" : tier.id)}
                  style={{
                    padding: '10px 16px', borderRadius: '10px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasAfterHours && (
        <div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              data-testid="input-after-hours"
              type="checkbox"
              checked={isAfterHours}
              onChange={e => setIsAfterHours(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor }}
            />
            After-hours / Weekend service (x{(config as any).afterHoursMult})
          </label>
        </div>
      )}

      {hasAddOns && (
        <AddOnsInput
          config={config}
          selectedAddOnIds={selectedAddOnIds}
          toggleAddOn={toggleAddOn}
          theme={theme}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}

function TierSelector({ config, selectedTierIndex, setSelectedTierIndex, theme, accentColor }: {
  config: PricingConfigV1;
  selectedTierIndex: number;
  setSelectedTierIndex: (n: number) => void;
  theme: any;
  accentColor: string;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  if (config.pricingType !== "tiered_packages" || !config.tiers?.length) return null;

  return (
    <div>
      <label style={labelStyle}>Choose a package</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {config.tiers.map((tier, idx) => {
          const isSelected = selectedTierIndex === idx;
          return (
            <button
              key={idx}
              data-testid={`option-tier-${idx}`}
              onClick={() => setSelectedTierIndex(idx)}
              style={{
                padding: '15px 18px', borderRadius: '12px',
                border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                background: isSelected ? `${accentColor}08` : theme.colors.surface,
                cursor: 'pointer', textAlign: 'left', fontSize: '15px',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? accentColor : theme.colors.body,
                transition: 'all 0.2s ease',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: isSelected ? `0 2px 8px ${accentColor}15` : '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  border: isSelected ? `6px solid ${accentColor}` : `2px solid ${theme.colors.border}`,
                  transition: 'all 0.2s ease', boxSizing: 'border-box',
                }} />
                {tier.label}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: isSelected ? accentColor : theme.colors.heading }}>
                ${tier.price.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddOnsInput({ config, selectedAddOnIds, toggleAddOn, theme, accentColor }: {
  config: PricingConfigV1;
  selectedAddOnIds: string[];
  toggleAddOn: (id: string) => void;
  theme: any;
  accentColor: string;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };
  const hasAddOns = "addOns" in config && (config as any).addOns?.length > 0;
  if (!hasAddOns) return null;

  return (
    <div>
      <label style={labelStyle}>Optional add-ons</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {((config as any).addOns as AddOn[]).map(ao => {
          const isSelected = selectedAddOnIds.includes(ao.id);
          return (
            <button
              key={ao.id}
              data-testid={`option-addon-${ao.id}`}
              onClick={() => toggleAddOn(ao.id)}
              style={{
                padding: '12px 16px', borderRadius: '10px',
                border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                background: isSelected ? `${accentColor}08` : theme.colors.surface,
                cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                color: isSelected ? accentColor : theme.colors.body,
                transition: 'all 0.2s ease',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 style={{ width: '16px', height: '16px', color: isSelected ? accentColor : theme.colors.border }} />
                {ao.label}
              </span>
              <span style={{ fontSize: '12px', color: theme.colors.muted, background: theme.colors.borderLight, padding: '3px 8px', borderRadius: '6px' }}>
                {ao.type === "pct" ? `+${ao.amount}%` : `+$${ao.amount}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionsInput({ config, selectedDifficultyId, setSelectedDifficultyId, isAfterHours, setIsAfterHours, hasDifficultyTiers, hasAfterHours, theme, accentColor }: {
  config: PricingConfigV1;
  selectedDifficultyId: string;
  setSelectedDifficultyId: (id: string) => void;
  isAfterHours: boolean;
  setIsAfterHours: (v: boolean) => void;
  hasDifficultyTiers: boolean;
  hasAfterHours: boolean;
  theme: any;
  accentColor: string;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {hasDifficultyTiers && (
        <div>
          <label style={labelStyle}>Complexity level</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {((config as any).difficultyTiers as DifficultyTier[]).map(tier => {
              const isSelected = selectedDifficultyId === tier.id;
              return (
                <button
                  key={tier.id}
                  data-testid={`option-difficulty-${tier.id}`}
                  onClick={() => setSelectedDifficultyId(isSelected ? "" : tier.id)}
                  style={{
                    padding: '10px 16px', borderRadius: '10px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasAfterHours && (
        <div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              data-testid="input-after-hours"
              type="checkbox"
              checked={isAfterHours}
              onChange={e => setIsAfterHours(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor }}
            />
            After-hours / Weekend service (x{(config as any).afterHoursMult})
          </label>
        </div>
      )}
    </div>
  );
}

function QuantityInput({ quantity, setQuantity, unitLabel, theme, accentColor, useSliders, sliderDefaults, config }: {
  quantity: number;
  setQuantity: (n: number) => void;
  unitLabel: string;
  theme: any;
  accentColor: string;
  useSliders: boolean;
  sliderDefaults: any;
  config: PricingConfigV1;
}) {
  const sliderConfig = getSliderConfig(unitLabel);
  const showSlider = useSliders && sliderConfig !== null;

  if (showSlider && sliderConfig) {
    return (
      <SliderField
        label={`How many ${unitLabel}${unitLabel !== "hour" ? "" : "s"} do you need?`}
        value={quantity}
        min={sliderConfig.min}
        max={sliderConfig.max}
        step={sliderDefaults?.step || sliderConfig.step}
        unitSuffix={sliderConfig.unitSuffix}
        showValueBubble={sliderDefaults?.show_value_bubble !== false}
        showMinMaxLabels={sliderDefaults?.show_min_max_labels !== false}
        onChange={setQuantity}
        accentColor={accentColor}
      />
    );
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  return (
    <div>
      <label style={labelStyle}>
        How many {unitLabel}{unitLabel !== "hour" ? "" : "s"} do you need?
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          data-testid="button-qty-minus"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Minus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
        </button>
        <input
          data-testid="input-quantity"
          type="number"
          value={quantity}
          onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          className="premium-input"
          style={{ width: '80px', textAlign: 'center', padding: '10px', borderRadius: '10px', fontSize: '16px', fontWeight: 600 }}
        />
        <button
          data-testid="button-qty-plus"
          onClick={() => setQuantity(quantity + 1)}
          style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Plus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
        </button>
        <span style={{ fontSize: '14px', color: theme.colors.muted }}>{unitLabel}</span>
      </div>
    </div>
  );
}

function PricingInputsNoQuantityNoTiers({ config, selectedAddOnIds, toggleAddOn, selectedDifficultyId, setSelectedDifficultyId, isAfterHours, setIsAfterHours, theme, accentColor }: {
  config: PricingConfigV1;
  selectedAddOnIds: string[];
  toggleAddOn: (id: string) => void;
  selectedDifficultyId: string;
  setSelectedDifficultyId: (id: string) => void;
  isAfterHours: boolean;
  setIsAfterHours: (v: boolean) => void;
  theme: any;
  accentColor: string;
}) {
  const hasDifficultyTiers = "difficultyTiers" in config && (config as any).difficultyTiers?.length > 0;
  const hasAfterHours = "afterHoursMult" in config && (config as any).afterHoursMult > 1;
  const hasAddOns = "addOns" in config && (config as any).addOns?.length > 0;

  if (!hasDifficultyTiers && !hasAfterHours && !hasAddOns) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '18px' }}>
      {hasDifficultyTiers && (
        <OptionsInput
          config={config}
          selectedDifficultyId={selectedDifficultyId}
          setSelectedDifficultyId={setSelectedDifficultyId}
          isAfterHours={isAfterHours}
          setIsAfterHours={setIsAfterHours}
          hasDifficultyTiers={true}
          hasAfterHours={false}
          theme={theme}
          accentColor={accentColor}
        />
      )}
      {hasAfterHours && (
        <OptionsInput
          config={config}
          selectedDifficultyId={selectedDifficultyId}
          setSelectedDifficultyId={setSelectedDifficultyId}
          isAfterHours={isAfterHours}
          setIsAfterHours={setIsAfterHours}
          hasDifficultyTiers={false}
          hasAfterHours={true}
          theme={theme}
          accentColor={accentColor}
        />
      )}
      {hasAddOns && (
        <AddOnsInput
          config={config}
          selectedAddOnIds={selectedAddOnIds}
          toggleAddOn={toggleAddOn}
          theme={theme}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}

function ResultPanel({ containerStyle, cardStyle, btnPrimary, theme, accentColor, estimate, calculator, isBookingEnabled, showBreakdown, onGetQuote, onBookNow, onStartOver }: {
  containerStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  btnPrimary: React.CSSProperties;
  theme: any;
  accentColor: string;
  estimate: EstimateResult;
  calculator: CalculatorData;
  isBookingEnabled: boolean;
  showBreakdown: boolean;
  onGetQuote: () => void;
  onBookNow: () => void;
  onStartOver: () => void;
}) {
  return (
    <div style={containerStyle}>
      <div className="animate-scale-in" style={cardStyle}>
        <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
        <div style={{ padding: '36px 32px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Your Estimated Quote</p>
          {estimate.type === "exact" && (
            <p className="animate-count-up" style={{ fontSize: '48px', fontWeight: 800, color: accentColor, marginBottom: '24px', letterSpacing: '-0.02em', lineHeight: 1 }}>
              ${estimate.total.toLocaleString()}
            </p>
          )}
          {estimate.type === "range" && (
            <p className="animate-count-up" style={{ fontSize: '36px', fontWeight: 800, color: accentColor, marginBottom: '24px', letterSpacing: '-0.02em', lineHeight: 1 }}>
              ${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}
            </p>
          )}
          {estimate.callUs && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', background: '#FEF3C7', border: '1px solid #FCD34D', fontSize: '13px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              For projects of this size, we recommend contacting us directly.
            </div>
          )}
          {showBreakdown && (
            <div style={{ marginBottom: '28px', textAlign: 'left' }}>
              {estimate.breakdown.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.borderLight}`, fontSize: '14px' }}>
                  <span style={{ color: theme.colors.body }}>{item.label}</span>
                  <span style={{ color: theme.colors.heading, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 style={{ width: '14px', height: '14px', color: accentColor }} />
                    {item.amount > 0 ? `$${item.amount.toLocaleString()}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button data-testid="button-get-quote" onClick={onGetQuote} style={btnPrimary}>
            {calculator.cta_button_text || 'Get My Free Quote'}
            <ArrowRight style={{ width: '18px', height: '18px' }} />
          </button>
          {isBookingEnabled && (
            <button
              data-testid="button-book-now"
              onClick={onBookNow}
              style={{
                ...btnPrimary,
                marginTop: '10px',
                background: 'transparent',
                color: accentColor,
                border: `2px solid ${accentColor}`,
                boxShadow: 'none',
              }}
            >
              <CalendarDays style={{ width: '18px', height: '18px' }} />
              Book Now
            </button>
          )}
          <button
            data-testid="button-start-over"
            onClick={onStartOver}
            style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
          >
            Start Over
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadFormPanel({ containerStyle, cardStyle, btnPrimary, labelStyle, theme, accentColor, estimate, calculator, leadData, setLeadData, leadMutation, submitting, submitError, onBack }: {
  containerStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  btnPrimary: React.CSSProperties;
  labelStyle: React.CSSProperties;
  theme: any;
  accentColor: string;
  estimate: EstimateResult;
  calculator: CalculatorData;
  leadData: { name: string; email: string; phone: string; company: string };
  setLeadData: (fn: (prev: any) => any) => void;
  leadMutation: any;
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
}) {
  return (
    <div style={containerStyle}>
      <div className="animate-fade-in" style={cardStyle}>
        <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
        <div style={{ padding: '28px 32px 32px' }}>
          <h3 style={{ fontSize: '21px', fontWeight: 700, color: theme.colors.heading, marginBottom: '4px' }}>Get Your Detailed Quote</h3>
          {estimate.type === "exact" && (
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>
              Estimated total: <strong style={{ color: accentColor, fontSize: '16px' }}>${estimate.total.toLocaleString()}</strong>
            </p>
          )}
          {estimate.type === "range" && (
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>
              Estimated range: <strong style={{ color: accentColor, fontSize: '16px' }}>${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}</strong>
            </p>
          )}
          {estimate.type === "call_for_quote" && (
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>{estimate.message}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { key: 'name', label: 'Your Name', placeholder: 'John Smith', type: 'text' },
              { key: 'email', label: 'Email Address', placeholder: 'john@company.com', type: 'email' },
              { key: 'phone', label: 'Phone Number', placeholder: '(555) 123-4567', type: 'tel' },
              { key: 'company', label: 'Company (optional)', placeholder: 'Company name', type: 'text' },
            ].map((field, i) => (
              <div key={field.key} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                <label style={labelStyle}>{field.label}</label>
                <input
                  data-testid={`lead-input-${field.key}`}
                  type={field.type}
                  value={(leadData as any)[field.key]}
                  onChange={e => setLeadData((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="premium-input"
                  style={{ width: '100%', padding: '11px 16px', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <button
            data-testid="button-submit-lead"
            onClick={() => leadMutation.mutate()}
            disabled={submitting || !leadData.email}
            style={{
              ...btnPrimary,
              marginTop: '24px',
              background: submitting || !leadData.email ? '#CBD5E1' : btnPrimary.background,
              color: submitting || !leadData.email ? '#94A3B8' : 'white',
              cursor: submitting ? 'wait' : !leadData.email ? 'not-allowed' : 'pointer',
              boxShadow: submitting || !leadData.email ? 'none' : btnPrimary.boxShadow,
            }}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Submitting...
              </span>
            ) : (calculator.cta_button_text || 'Get My Free Quote')}
          </button>
          {submitError && (
            <div className="animate-fade-in" style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle style={{ width: '14px', height: '14px', color: '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#991B1B' }}>{submitError}</span>
            </div>
          )}
          <button
            data-testid="button-back-to-quote"
            onClick={onBack}
            style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <ChevronLeft style={{ width: '14px', height: '14px' }} /> Back to quote
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingPanel({ containerStyle, cardStyle, btnPrimary, labelStyle, theme, accentColor, estimate, depositInfo, calendarMonth, setCalendarMonth, workingDays, selectedDate, setSelectedDate, selectedTime, setSelectedTime, availableSlots, loadingSlots, bookingCustomer, setBookingCustomer, bookingMutation, onBack }: {
  containerStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  btnPrimary: React.CSSProperties;
  labelStyle: React.CSSProperties;
  theme: any;
  accentColor: string;
  estimate: EstimateResult;
  depositInfo: { amount: number; label: string } | null;
  calendarMonth: { year: number; month: number };
  setCalendarMonth: (fn: (prev: { year: number; month: number }) => { year: number; month: number }) => void;
  workingDays: string[];
  selectedDate: string;
  setSelectedDate: (s: string) => void;
  selectedTime: string;
  setSelectedTime: (s: string) => void;
  availableSlots: string[];
  loadingSlots: boolean;
  bookingCustomer: { name: string; email: string; phone: string };
  setBookingCustomer: (fn: (prev: any) => any) => void;
  bookingMutation: any;
  onBack: () => void;
}) {
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);

  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const firstDayOfMonth = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
  const monthName = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const canGoPrev = calendarMonth.year > today.getFullYear() || (calendarMonth.year === today.getFullYear() && calendarMonth.month > today.getMonth());
  const canGoNext = new Date(calendarMonth.year, calendarMonth.month + 1, 1) <= maxDate;

  return (
    <div style={containerStyle}>
      <div className="animate-fade-in" style={cardStyle}>
        <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
        <div style={{ padding: '28px 32px 32px' }}>
          <h3 style={{ fontSize: '21px', fontWeight: 700, color: theme.colors.heading, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarDays style={{ width: '22px', height: '22px', color: accentColor }} />
            Book Your Appointment
          </h3>
          {estimate.type === "exact" && (
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '20px' }}>
              Estimated total: <strong style={{ color: accentColor }}>${estimate.total.toLocaleString()}</strong>
            </p>
          )}
          {estimate.type === "range" && (
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '20px' }}>
              Estimated range: <strong style={{ color: accentColor }}>${estimate.rangeMin?.toLocaleString()} - ${estimate.rangeMax?.toLocaleString()}</strong>
            </p>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Select a Date</label>
            <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <button
                  data-testid="button-cal-prev"
                  onClick={() => {
                    if (!canGoPrev) return;
                    setCalendarMonth(prev => {
                      const m = prev.month - 1;
                      return m < 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: m };
                    });
                  }}
                  disabled={!canGoPrev}
                  style={{ border: 'none', background: 'transparent', cursor: canGoPrev ? 'pointer' : 'default', padding: '4px', color: canGoPrev ? theme.colors.body : theme.colors.borderLight }}
                >
                  <ChevronLeft style={{ width: '18px', height: '18px' }} />
                </button>
                <span style={{ fontSize: '15px', fontWeight: 600, color: theme.colors.heading }}>{monthName}</span>
                <button
                  data-testid="button-cal-next"
                  onClick={() => {
                    if (!canGoNext) return;
                    setCalendarMonth(prev => {
                      const m = prev.month + 1;
                      return m > 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: m };
                    });
                  }}
                  disabled={!canGoNext}
                  style={{ border: 'none', background: 'transparent', cursor: canGoNext ? 'pointer' : 'default', padding: '4px', color: canGoNext ? theme.colors.body : theme.colors.borderLight }}
                >
                  <ChevronRight style={{ width: '18px', height: '18px' }} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                {dayNames.map(d => (
                  <div key={d} style={{ fontSize: '11px', fontWeight: 600, color: theme.colors.muted, padding: '4px 0' }}>{d}</div>
                ))}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(calendarMonth.year, calendarMonth.month, day);
                  const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayOfWeek = dateObj.getDay();
                  const isWorkingDay = workingDays.includes(dayMap[dayOfWeek]);
                  const isPast = dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const isFuture = dateObj > maxDate;
                  const isEnabled = isWorkingDay && !isPast && !isFuture;
                  const isSelected = selectedDate === dateStr;

                  return (
                    <button
                      key={day}
                      data-testid={`button-date-${dateStr}`}
                      onClick={() => isEnabled && setSelectedDate(dateStr)}
                      disabled={!isEnabled}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid ${accentColor}` : '1px solid transparent',
                        background: isSelected ? `${accentColor}15` : 'transparent',
                        color: !isEnabled ? theme.colors.borderLight : isSelected ? accentColor : theme.colors.body,
                        fontSize: '13px',
                        fontWeight: isSelected ? 700 : 400,
                        cursor: isEnabled ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedDate && (
            <div className="animate-fade-in" style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>
                <Clock style={{ width: '13px', height: '13px', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Available Times for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </label>
              {loadingSlots ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite', color: theme.colors.muted }} />
                </div>
              ) : availableSlots.length === 0 ? (
                <p style={{ fontSize: '13px', color: theme.colors.muted, padding: '12px', textAlign: 'center', background: theme.colors.surfaceRaised, borderRadius: '8px' }}>
                  No available slots for this date.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {availableSlots.map(slot => {
                    const isSelected = selectedTime === slot;
                    return (
                      <button
                        key={slot}
                        data-testid={`button-slot-${slot}`}
                        onClick={() => setSelectedTime(slot)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '10px',
                          border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                          background: isSelected ? `${accentColor}10` : theme.colors.surface,
                          color: isSelected ? accentColor : theme.colors.body,
                          fontSize: '13px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {formatTime12(slot)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedDate && selectedTime && (
            <div className="animate-fade-in" style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Your Details</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { key: 'name', label: 'Name', placeholder: 'Your full name', type: 'text' },
                  { key: 'email', label: 'Email', placeholder: 'email@example.com', type: 'email' },
                  { key: 'phone', label: 'Phone (optional)', placeholder: '(555) 123-4567', type: 'tel' },
                ].map(field => (
                  <input
                    key={field.key}
                    data-testid={`booking-input-${field.key}`}
                    type={field.type}
                    value={(bookingCustomer as any)[field.key]}
                    onChange={e => setBookingCustomer((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="premium-input"
                    style={{ width: '100%', padding: '11px 16px', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                ))}
              </div>
            </div>
          )}

          {selectedDate && selectedTime && (
            <div className="animate-fade-in" style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '12px', background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
              <div style={{ fontSize: '13px', color: theme.colors.muted, marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Booking Summary</div>
              <div style={{ fontSize: '14px', color: theme.colors.heading, lineHeight: 1.8 }}>
                <div>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                <div>{formatTime12(selectedTime)}</div>
                {depositInfo && (
                  <div style={{ marginTop: '4px', fontSize: '13px', color: accentColor, fontWeight: 600 }}>
                    Deposit required: ${depositInfo.amount.toLocaleString()} ({depositInfo.label})
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            data-testid="button-confirm-booking"
            onClick={() => bookingMutation.mutate()}
            disabled={!selectedDate || !selectedTime || !bookingCustomer.name || bookingMutation.isPending}
            style={{
              ...btnPrimary,
              background: !selectedDate || !selectedTime || !bookingCustomer.name ? '#CBD5E1' : btnPrimary.background,
              color: !selectedDate || !selectedTime || !bookingCustomer.name ? '#94A3B8' : 'white',
              cursor: bookingMutation.isPending ? 'wait' : (!selectedDate || !selectedTime || !bookingCustomer.name) ? 'not-allowed' : 'pointer',
              boxShadow: !selectedDate || !selectedTime || !bookingCustomer.name ? 'none' : btnPrimary.boxShadow,
            }}
          >
            {bookingMutation.isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Booking...
              </span>
            ) : depositInfo ? `Pay ${depositInfo.label} & Confirm` : 'Confirm Booking'}
          </button>

          <button
            data-testid="button-back-to-estimate"
            onClick={onBack}
            style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <ChevronLeft style={{ width: '14px', height: '14px' }} /> Back to estimate
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
