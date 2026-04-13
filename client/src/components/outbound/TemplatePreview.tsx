/**
 * TemplatePreview — read-only outreach copy preview
 *
 * Given a prospect + enrichment, renders:
 *   - Recommended offer (from target_offer, operator can override)
 *   - 3 angle options per offer
 *   - 6 message types: Email 1 / Follow-up 1 / Follow-up 2 / Breakup / Contact Form / DM
 *   - Merged output with Copy button
 *
 * Intentionally deferred:
 *   - Editable copy
 *   - Sequence scheduling
 *   - Rich text / formatting
 *   - Template versioning
 */

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Star, Globe, Mail, Phone, Zap } from "lucide-react";
import {
  OFFER_TEMPLATES,
  OFFER_KEYS,
  MESSAGE_TYPE_LABELS,
  type OfferKey,
  type MessageType,
} from "@/lib/outboundTemplates";
import { renderTemplate, buildMergeFields } from "@/lib/templateMerge";
import { trackEvent } from "@/lib/trackEvent";

/* ─── Types (mirroring ProspectsPage shapes) ─── */

interface PreviewProspect {
  id: number;
  business_name: string;
  owner_name?: string | null;
  contact_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  website_domain?: string | null;
  trade_category?: string | null;
  city?: string | null;
  state?: string | null;
  google_rating?: string | null;
  google_review_count?: number | null;
  status: string;
  target_offer?: string | null;
  priority_score?: number | null;
}

interface PreviewEnrichment {
  quality_score?: number | null;
  ai_first_line?: string | null;
  ai_offer_angle?: string | null;
  ai_cta_variant?: string | null;
  ai_reason_to_target?: string | null;
  ai_notes?: string | null;
  enrichment_source?: string | null;
}

interface Props {
  prospect: PreviewProspect | null;
  enrichment: PreviewEnrichment | null;
  open: boolean;
  onClose: () => void;
  /** Operator's first name — used as {{sender_name}} */
  senderName?: string;
}

/* ─── Helpers ─── */

const EMAIL_TYPES: MessageType[] = ["first_touch", "follow_up_1", "follow_up_2", "breakup"];
const SHORT_TYPES: MessageType[] = ["contact_form", "dm"];

function isValidOffer(key: string | null | undefined): key is OfferKey {
  return OFFER_KEYS.includes(key as OfferKey);
}

function OfferPill({ offerKey, active, onClick }: { offerKey: OfferKey; active: boolean; onClick: () => void }) {
  const offer = OFFER_TEMPLATES[offerKey];
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-all border ${
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
      }`}
    >
      {offer.label}
    </button>
  );
}

function AngleButton({
  label,
  hook,
  bestFor,
  active,
  letter,
  onClick,
}: {
  label: string;
  hook: string;
  bestFor: string;
  active: boolean;
  letter: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
        active
          ? "border-gray-900 bg-gray-50"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}`}>
          {letter}
        </span>
        <span className={`font-medium ${active ? "text-gray-900" : "text-gray-600"}`}>{label}</span>
      </div>
      <p className="text-gray-500 leading-snug">{hook}</p>
    </button>
  );
}

function MessageTypeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded whitespace-nowrap transition-all ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Main component ─── */

export function TemplatePreview({ prospect, enrichment, open, onClose, senderName }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const defaultOffer: OfferKey = isValidOffer(prospect?.target_offer)
    ? prospect!.target_offer as OfferKey
    : "quotequick";

  const [selectedOffer, setSelectedOffer] = useState<OfferKey>(defaultOffer);
  const [selectedAngleIdx, setSelectedAngleIdx] = useState(0);
  const [selectedType, setSelectedType] = useState<MessageType>("first_touch");

  // Reset selections when prospect changes
  const offerFromProspect: OfferKey = isValidOffer(prospect?.target_offer)
    ? prospect!.target_offer as OfferKey
    : "quotequick";

  const offer = OFFER_TEMPLATES[selectedOffer];
  const angle = offer.angles[selectedAngleIdx];
  const message = angle.messages[selectedType];

  const mergeFields = useMemo(() => {
    if (!prospect) return {};
    return buildMergeFields(prospect, enrichment, senderName);
  }, [prospect, enrichment, senderName]);

  const renderedSubject = message.subject
    ? renderTemplate(message.subject, mergeFields)
    : null;

  const renderedBody = renderTemplate(message.body, mergeFields);

  const copyText = renderedSubject
    ? `Subject: ${renderedSubject}\n\n${renderedBody}`
    : renderedBody;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent("template_copied", {
        offer: selectedOffer,
        angle: angle.id,
        message_type: selectedType,
        prospect_id: prospect.id,
      });
    } catch {
      toast({ title: "Copy failed", description: "Please select the text manually", variant: "destructive" });
    }
  }

  function handleOfferChange(key: OfferKey) {
    setSelectedOffer(key);
    setSelectedAngleIdx(0);
    // keep message type if it's valid for the new offer
  }

  if (!prospect) return null;

  const score = enrichment?.quality_score ?? null;
  const scoreColor = score !== null
    ? score >= 70 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-500"
    : "text-gray-400";

  const isEmailType = EMAIL_TYPES.includes(selectedType);
  const recommendedOffer = offerFromProspect;
  const offerChanged = selectedOffer !== recommendedOffer;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <DialogTitle className="text-base">Outreach Copy</DialogTitle>

          {/* Prospect meta */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <p className="font-semibold text-gray-900 text-sm">{prospect.business_name}</p>
              <p className="text-xs text-gray-500">
                {[prospect.trade_category, prospect.city, prospect.state].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {score !== null && (
                <span className={`font-bold text-sm ${scoreColor}`}>{score}</span>
              )}
              {prospect.priority_score != null && (
                <span className="flex items-center gap-0.5">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-600 font-medium">{prospect.priority_score}</span>
                </span>
              )}
              {prospect.google_rating && (
                <span className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-amber-400" />
                  {prospect.google_rating}
                  {prospect.google_review_count != null && ` (${prospect.google_review_count})`}
                </span>
              )}
              {prospect.primary_email && <Mail className="w-3.5 h-3.5" />}
              {prospect.primary_phone && <Phone className="w-3.5 h-3.5" />}
              {prospect.website_domain && <Globe className="w-3.5 h-3.5" />}
            </div>
          </div>

          {/* AI reason to target */}
          {enrichment?.ai_reason_to_target && (
            <p className="mt-2 text-xs text-blue-600 bg-blue-50 rounded px-2.5 py-1.5 leading-snug">
              {enrichment.ai_reason_to_target}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

          {/* Offer selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-gray-700">Offer</p>
              {offerChanged && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Recommended: {OFFER_TEMPLATES[recommendedOffer].label}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OFFER_KEYS.map((key) => (
                <OfferPill
                  key={key}
                  offerKey={key}
                  active={selectedOffer === key}
                  onClick={() => handleOfferChange(key)}
                />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{offer.tagline}</p>
          </div>

          {/* Angle selector */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Angle</p>
            <div className="grid grid-cols-3 gap-2">
              {offer.angles.map((a, idx) => (
                <AngleButton
                  key={a.id}
                  letter={String.fromCharCode(65 + idx)}
                  label={a.label}
                  hook={a.hook}
                  bestFor={a.bestFor}
                  active={selectedAngleIdx === idx}
                  onClick={() => setSelectedAngleIdx(idx)}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              <span className="font-medium">Best for:</span> {angle.bestFor}
            </p>
          </div>

          {/* Message type tabs */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Message</p>
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
              {EMAIL_TYPES.map((t) => (
                <MessageTypeTab
                  key={t}
                  label={MESSAGE_TYPE_LABELS[t]}
                  active={selectedType === t}
                  onClick={() => setSelectedType(t)}
                />
              ))}
              <div className="w-px bg-gray-300 mx-0.5 self-stretch" />
              {SHORT_TYPES.map((t) => (
                <MessageTypeTab
                  key={t}
                  label={MESSAGE_TYPE_LABELS[t]}
                  active={selectedType === t}
                  onClick={() => setSelectedType(t)}
                />
              ))}
            </div>
          </div>

          {/* Rendered preview */}
          <div className="space-y-2">
            {isEmailType && renderedSubject && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mr-2">Subject</span>
                <span className="text-sm text-gray-800">{renderedSubject}</span>
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative">
              <pre className="text-sm text-gray-800 font-sans whitespace-pre-wrap leading-relaxed">
                {renderedBody}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-gray-400">
            {isEmailType ? "Sequence email" : "Short format"} · {offer.label} · Angle {String.fromCharCode(65 + selectedAngleIdx)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
              Close
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-gray-900 hover:bg-gray-700"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
