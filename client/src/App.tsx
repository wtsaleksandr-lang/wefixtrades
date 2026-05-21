import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CopilotFormProvider } from "@/context/CopilotFormContext";
import NotFound from "@/pages/not-found";
import Wizard from "@/pages/wizard";
import WizardLegacy from "@/pages/wizard-legacy";
import Calculator from "@/pages/calculator";
import EditCalculator from "@/pages/edit-calculator";
import LeadsPage from "@/pages/leads";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import MarketingHome from "@/pages/marketing/home";
import { hostedSlugFromHost } from "@shared/slugUtils";
import MarketingProduct from "@/pages/marketing/product";
import MarketingPricing from "@/pages/marketing/pricing";
import QuoteQuickPricing from "@/pages/marketing/quotequick-pricing";
import ProductIndex from "@/pages/product/ProductIndex";
import MarketingServices from "@/pages/marketing/services";
import MarketingBundles from "@/pages/marketing/bundles";
import MarketingTemplates from "@/pages/marketing/templates";
import MarketingDemo from "@/pages/marketing/demo";
import MarketingDocs from "@/pages/marketing/docs";
import MarketingContact from "@/pages/marketing/contact";
import MarketingPrivacy from "@/pages/marketing/privacy";
import MarketingTerms from "@/pages/marketing/terms";
import FeatureInstantQuotes from "@/pages/marketing/features/instant-quotes";
import FeatureBooking from "@/pages/marketing/features/booking";
import FeatureAiEmployee from "@/pages/marketing/features/ai-employee";
import FeatureSms from "@/pages/marketing/features/sms";
import FeatureCalculatorEngine from "@/pages/marketing/features/calculator-engine";
import DemoTemplate from "@/pages/marketing/demo-template";
import DocsEmbed from "@/pages/marketing/docs/embed";
import DocsDomain from "@/pages/marketing/docs/domain";
import DocsBooking from "@/pages/marketing/docs/booking";
import DocsAi from "@/pages/marketing/docs/ai";
import DocsMapguard from "@/pages/marketing/docs/mapguard";
import DocsReputationShield from "@/pages/marketing/docs/reputationshield";
import DocsWebhooks from "@/pages/marketing/docs/webhooks";
import DocsTroubleshooting from "@/pages/marketing/docs/troubleshooting";
// AJ-7 — API developer docs
import ApiDocsPage from "@/pages/marketing/ApiDocsPage";
import SolutionsVisibility from "@/pages/marketing/solutions-visibility";
import FreeAudit from "@/pages/marketing/FreeAudit";
import MissedCallCalculator from "@/pages/marketing/missed-call-calculator";
import MissedCallCalculatorTrade from "@/pages/marketing/missed-call-calculator-trade";
import QuoteCalculatorDemo from "@/pages/marketing/quote-calculator-demo";
import ToolsHub from "@/pages/marketing/tools-hub";
import SharedAuditReport from "@/pages/marketing/SharedAuditReport";
import CompareNiceJob from "@/pages/marketing/CompareNiceJob";
import ComparisonPage from "@/pages/marketing/ComparisonPage";
import EffortelProductPage from "@/pages/products/EffortelProductPage";
import SolutionPage from "@/pages/solutions/SolutionPage";
import DemoCenter from "@/pages/demos/DemoCenter";
import DemoPage from "@/pages/demos/DemoPage";
import SocialSyncDemo from "@/pages/demos/SocialSyncDemo";
import RankFlowDemo from "@/pages/demos/RankFlowDemo";
import ReputationShieldDemo from "@/pages/demos/ReputationShieldDemo";
import Plans from "@/pages/Plans";
import PricingUnified from "@/pages/PricingUnified";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancelled from "@/pages/CheckoutCancelled";
import Resources from "@/pages/Resources";
import DesignShowcase from "@/pages/marketing/DesignShowcase";
import About from "@/pages/About";
import Blog from "@/pages/Blog";
import CaseStudies from "@/pages/CaseStudies";
import PrimitivesPage from "@/pages/dev/primitives";
import DemoCanvas from "@/pages/dev/DemoCanvas";
import RequirePortal from "@/components/auth/RequirePortal";
import AiDashboard from "@/pages/admin/AiDashboard";
import CrmOverview from "@/pages/admin/CrmOverview";
import ClientsPage from "@/pages/admin/ClientsPage";
import ClientDetailPage from "@/pages/admin/ClientDetailPage";
import SuppliersPage from "@/pages/admin/SuppliersPage";
import InboxPage from "@/pages/admin/InboxPage";
import CommunicationsPage from "@/pages/admin/CommunicationsPage";
import SystemAlertsPage from "@/pages/admin/SystemAlertsPage";
import AdminAuditLogPage from "@/pages/admin/AdminAuditLogPage";
import WaitlistPage from "@/pages/admin/WaitlistPage";
/* AI-3c audit log */
import AuditLogPage from "@/pages/admin/AuditLogPage";
import AuditLeadsPage from "@/pages/admin/AuditLeadsPage";
import AdminChatHistoryPage from "@/pages/admin/AdminChatHistoryPage";
import PortalChatHistoryPage from "@/pages/portal/PortalChatHistoryPage";
import IntegrationHealthPage from "@/pages/admin/IntegrationHealthPage";
import BillingPage from "@/pages/admin/BillingPage";
import ServicesPage from "@/pages/admin/ServicesPage";
import ProductDetailPage from "@/pages/admin/ProductDetailPage";
import ServiceOpsPage from "@/pages/admin/ServiceOpsPage";
import MapguardDashboard from "@/pages/admin/MapguardDashboard";
import MapguardOpsPage from "@/pages/admin/MapguardOpsPage";
import WebCareOpsPage from "@/pages/admin/WebCareOpsPage";
import AiBudgetPage from "@/pages/admin/AiBudgetPage";
import AdminAiGatesPage from "@/pages/admin/AdminAiGatesPage";
import ReviewsPage from "@/pages/admin/ReviewsPage";
import RankFlowOpsPage from "@/pages/admin/RankFlowOpsPage";
import AdFlowOpsPage from "@/pages/admin/AdFlowOpsPage";
import ProfilePage from "@/pages/admin/ProfilePage";
import SettingsPage from "@/pages/admin/SettingsPage";
import ChangePasswordPage from "@/pages/admin/ChangePasswordPage";
import ProspectsPage from "@/pages/admin/outbound/ProspectsPage";
import CampaignsPage from "@/pages/admin/outbound/CampaignsPage";
import PipelinePage from "@/pages/admin/outbound/PipelinePage";
import SocialSyncOpsPage from "@/pages/admin/SocialSyncOpsPage";
import ContentFlowQueuePage from "@/pages/admin/ContentFlowQueuePage";
import SalesPipelinePage from "@/pages/admin/SalesPipelinePage";
import OnboardingForm from "@/pages/OnboardingForm";
import ReviewFunnel from "@/pages/ReviewFunnel";
import ReviewQrLanding from "@/pages/ReviewQrLanding";
import RequireClient from "@/components/auth/RequireClient";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalServices from "@/pages/portal/PortalServices";
import PortalReviews from "@/pages/portal/PortalReviews";
import PortalCompetitors from "@/pages/portal/PortalCompetitors";
import PortalWidget from "@/pages/portal/PortalWidget";
import PortalReviewsSetup from "@/pages/portal/PortalReviewsSetup";
import PortalServiceDetail from "@/pages/portal/PortalServiceDetail";
import PortalBilling from "@/pages/portal/PortalBilling";
import PortalSettings from "@/pages/portal/PortalSettings";
import PortalOnboarding from "@/pages/portal/PortalOnboarding";
import TradelineSetupPage from "@/pages/portal/TradelineSetup";
import PortalEmailDomainSetup from "@/pages/portal/PortalEmailDomainSetup";
import ChatWidgetInstallEntry from "@/pages/portal/ChatWidgetInstallEntry";
import ChatWidgetInstallOnboarding from "@/pages/portal/ChatWidgetInstallOnboarding";
import InstallQueuePage from "@/pages/admin/InstallQueuePage";
import PortalChatWidgetSetup from "@/pages/portal/PortalChatWidgetSetup";
import PortalHelp from "@/pages/portal/PortalHelp";
import PortalTicketDetail from "@/pages/portal/PortalTicketDetail";
import SupportInboxPage from "@/pages/admin/SupportInboxPage";
import SupportTicketDetailPage from "@/pages/admin/SupportTicketDetailPage";
import AdminNoticesPage from "@/pages/admin/AdminNoticesPage";
import PortalMapguard from "@/pages/portal/PortalMapguard";
import SocialSyncSetup from "@/pages/portal/SocialSyncSetup";
import PortalSocialSync from "@/pages/portal/PortalSocialSync";
import PortalRankFlow from "@/pages/portal/PortalRankFlow";
import PortalArticles from "@/pages/portal/PortalArticles";
import PortalContentPreferences from "@/pages/portal/PortalContentPreferences";
import ResetPasswordPage from "@/pages/ResetPassword";
import SignupPage from "@/pages/Signup";
import SignupBusinessNamePage from "@/pages/SignupBusinessName";
import BookingCalendarPage from "@/pages/admin/BookingCalendarPage";
import SystemJobsPage from "@/pages/admin/SystemJobsPage";
import SystemWorkersPage from "@/pages/admin/SystemWorkersPage";
import SystemAvailabilityPage from "@/pages/admin/SystemAvailabilityPage";
import TradeLineOpsPage from "@/pages/admin/TradeLineOpsPage";
import TradelineSetupsPage from "@/pages/admin/TradelineSetupsPage";
import TradelineTemplatesPage from "@/pages/admin/TradelineTemplatesPage";
import TradelineLearningPage from "@/pages/admin/TradelineLearningPage";
import MobilePreviewPage from "@/pages/admin/MobilePreview";
import QuoteQuickPage from "@/pages/admin/QuoteQuickPage";
import QuoteQuickTradesPage from "@/pages/admin/QuoteQuickTradesPage";
import QuoteQuickTradeDetailPage from "@/pages/admin/QuoteQuickTradeDetailPage";
import QuoteQuickTemplatesPage from "@/pages/admin/QuoteQuickTemplatesPage";
import QuoteQuickTemplateDetailPage from "@/pages/admin/QuoteQuickTemplateDetailPage";
/* AJ-4 API platform admin */
import ApiPlatformPage from "@/pages/admin/ApiPlatformPage";
import ApiPlatformUserDetailPage from "@/pages/admin/ApiPlatformUserDetailPage";
import BookingPage from "@/pages/public/BookingPage";
import PayInvoicePage from "@/pages/public/PayInvoicePage";
import QuoteSnapshotPage from "@/pages/quote-snapshot";
import DispatchPage from "@/pages/portal/DispatchPage";
import InvoicesPage from "@/pages/portal/InvoicesPage";
import PaymentMethodsPage from "@/pages/portal/PaymentMethodsPage";
import BookFlowSetupPage from "@/pages/portal/BookFlowSetupPage";
import PortalCatalog from "@/pages/portal/PortalCatalog";
import PortalApiAccessPage from "@/pages/portal/PortalApiAccessPage";
import PortalBrandKitsPage from "@/pages/portal/PortalBrandKitsPage";

/**
 * Root route. On a hosted-calculator subdomain ({slug}.your-quote.net) the
 * bare `/` shows that customer's calculator; everywhere else it's the
 * marketing home page.
 */
function RootRoute() {
  return hostedSlugFromHost() ? <Calculator /> : <MarketingHome />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />

      <Route path="/admin/ai">{() => <RequirePortal><AiDashboard /></RequirePortal>}</Route>
      <Route path="/admin/ai-gates">{() => <RequirePortal><AdminAiGatesPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/sales">{() => <RequirePortal><SalesPipelinePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/socialsync">{() => <RequirePortal><SocialSyncOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/contentflow">{() => <RequirePortal><ContentFlowQueuePage /></RequirePortal>}</Route>
      <Route path="/admin/contentflow">{() => <Redirect to="/admin/crm/contentflow" />}</Route>
      <Route path="/admin/crm/clients/:id">{() => <RequirePortal><ClientDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/clients">{() => <RequirePortal><ClientsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/inbox">{() => <RequirePortal><InboxPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/communications">{() => <RequirePortal><CommunicationsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/alerts">{() => <RequirePortal><SystemAlertsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/audit-log">{() => <RequirePortal><AdminAuditLogPage /></RequirePortal>}</Route>
      {/* AI-3c audit log */}
      <Route path="/admin/audit-log">{() => <RequirePortal><AuditLogPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/audit-leads">{() => <RequirePortal><AuditLeadsPage /></RequirePortal>}</Route>
      <Route path="/admin/chat-history">{() => <RequirePortal><AdminChatHistoryPage /></RequirePortal>}</Route>
      <Route path="/admin/system/integrations">{() => <RequirePortal><IntegrationHealthPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/billing">{() => <RequirePortal><BillingPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/suppliers">{() => <RequirePortal><SuppliersPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/rankflow">{() => <RequirePortal><RankFlowOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/adflow">{() => <RequirePortal><AdFlowOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/tradeline-ops">{() => <RequirePortal><TradeLineOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/tradeline-setups">{() => <RequirePortal><TradelineSetupsPage /></RequirePortal>}</Route>
      <Route path="/admin/tradeline/templates">{() => <RequirePortal><TradelineTemplatesPage /></RequirePortal>}</Route>
      <Route path="/admin/tradeline/learning">{() => <RequirePortal><TradelineLearningPage /></RequirePortal>}</Route>
      <Route path="/admin/mobile-preview">{() => <RequirePortal><MobilePreviewPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/quotequick">{() => <RequirePortal><QuoteQuickPage /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/trades/:id">{(params) => <RequirePortal><QuoteQuickTradeDetailPage tradeId={params.id} /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/trades">{() => <RequirePortal><QuoteQuickTradesPage /></RequirePortal>}</Route>
      {/* AI-3b template editor routes */}
      <Route path="/admin/quotequick/templates/:id">{(params) => <RequirePortal><QuoteQuickTemplateDetailPage templateId={params.id} /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/templates">{() => <RequirePortal><QuoteQuickTemplatesPage /></RequirePortal>}</Route>
      {/* AJ-4 API platform admin */}
      <Route path="/admin/api-platform/users/:userId">{(params) => <RequirePortal><ApiPlatformUserDetailPage userId={params.userId} /></RequirePortal>}</Route>
      <Route path="/admin/api-platform">{() => <RequirePortal><ApiPlatformPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support/:id">{() => <RequirePortal><SupportTicketDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support">{() => <RequirePortal><SupportInboxPage /></RequirePortal>}</Route>
      <Route path="/admin/notices">{() => <RequirePortal><AdminNoticesPage /></RequirePortal>}</Route>
      {/* W-AN-2 Coming Soon waitlist */}
      <Route path="/admin/waitlist">{() => <RequirePortal><WaitlistPage /></RequirePortal>}</Route>
      <Route path="/admin/booking">{() => <RequirePortal><BookingCalendarPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/services">{() => <RequirePortal><ServicesPage /></RequirePortal>}</Route>
      <Route path="/admin/products/:id">{() => <RequirePortal><ProductDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/service-ops">{() => <RequirePortal><ServiceOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/mapguard">{() => <RequirePortal><MapguardDashboard /></RequirePortal>}</Route>
      <Route path="/admin/crm/mapguard/ops">{() => <RequirePortal><MapguardOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/webcare/ops">{() => <RequirePortal><WebCareOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/ai-budget">{() => <RequirePortal><AiBudgetPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/reviews">{() => <RequirePortal><ReviewsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/profile">{() => <RequirePortal><ProfilePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/settings">{() => <RequirePortal><SettingsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/change-password">{() => <RequirePortal><ChangePasswordPage /></RequirePortal>}</Route>
      <Route path="/admin/crm">{() => <RequirePortal><CrmOverview /></RequirePortal>}</Route>
      <Route path="/admin">{() => <Redirect to="/admin/crm" />}</Route>

      {/* System monitoring */}
      <Route path="/admin/system/jobs">{() => <RequirePortal><SystemJobsPage /></RequirePortal>}</Route>
      <Route path="/admin/system/workers">{() => <RequirePortal><SystemWorkersPage /></RequirePortal>}</Route>
      <Route path="/admin/system/availability">{() => <RequirePortal><SystemAvailabilityPage /></RequirePortal>}</Route>

      {/* Outbound lead management */}
      <Route path="/admin/outbound/prospects">{() => <RequirePortal><ProspectsPage /></RequirePortal>}</Route>
      <Route path="/admin/outbound/campaigns">{() => <RequirePortal><CampaignsPage /></RequirePortal>}</Route>
      <Route path="/admin/outbound/pipeline">{() => <RequirePortal><PipelinePage /></RequirePortal>}</Route>
      <Route path="/admin/outbound">{() => <Redirect to="/admin/outbound/prospects" />}</Route>

      {/* Client portal */}
      <Route path="/portal/tradeline/setup">{() => <RequireClient><TradelineSetupPage /></RequireClient>}</Route>
      <Route path="/portal/tradeline/email-domain/setup">{() => <RequireClient><PortalEmailDomainSetup /></RequireClient>}</Route>
      <Route path="/portal/tradeline/chat-widget/install">{() => <RequireClient><ChatWidgetInstallEntry /></RequireClient>}</Route>
      <Route path="/portal/tradeline/chat-widget/install-onboarding">{() => <RequireClient><ChatWidgetInstallOnboarding /></RequireClient>}</Route>
      <Route path="/admin/install-queue">{() => <RequirePortal><InstallQueuePage /></RequirePortal>}</Route>
      <Route path="/portal/tradeline/chat-widget">{() => <RequireClient><PortalChatWidgetSetup /></RequireClient>}</Route>
      <Route path="/portal/onboarding/:id">{() => <RequireClient><PortalOnboarding /></RequireClient>}</Route>
      <Route path="/portal/services/:id">{() => <RequireClient><PortalServiceDetail /></RequireClient>}</Route>
      <Route path="/portal/mapguard">{() => <RequireClient><PortalMapguard /></RequireClient>}</Route>
      <Route path="/portal/services">{() => <RequireClient><PortalServices /></RequireClient>}</Route>
      <Route path="/portal/catalog">{() => <RequireClient><PortalCatalog /></RequireClient>}</Route>
      <Route path="/portal/reviews/widget">{() => <RequireClient><PortalWidget /></RequireClient>}</Route>
      <Route path="/portal/reviews/setup">{() => <RequireClient><PortalReviewsSetup /></RequireClient>}</Route>
      <Route path="/portal/reviews/competitors">{() => <RequireClient><PortalCompetitors /></RequireClient>}</Route>
      <Route path="/portal/reviews">{() => <RequireClient><PortalReviews /></RequireClient>}</Route>
      <Route path="/portal/rankflow">{() => <RequireClient><PortalRankFlow /></RequireClient>}</Route>
      <Route path="/portal/articles">{() => <RequireClient><PortalArticles /></RequireClient>}</Route>
      <Route path="/portal/content-preferences">{() => <RequireClient><PortalContentPreferences /></RequireClient>}</Route>
      <Route path="/portal/billing">{() => <RequireClient><PortalBilling /></RequireClient>}</Route>
      <Route path="/portal/help/tickets/:id">{() => <RequireClient><PortalTicketDetail /></RequireClient>}</Route>
      <Route path="/portal/socialsync-setup">{() => <RequireClient><SocialSyncSetup /></RequireClient>}</Route>
      <Route path="/portal/socialsync">{() => <RequireClient><PortalSocialSync /></RequireClient>}</Route>
      <Route path="/portal/reputation">{() => <Redirect to="/portal/reviews" />}</Route>
      <Route path="/portal/dispatch">{() => <RequireClient><DispatchPage /></RequireClient>}</Route>
      <Route path="/portal/invoices">{() => <RequireClient><InvoicesPage /></RequireClient>}</Route>
      <Route path="/portal/payment-methods">{() => <RequireClient><PaymentMethodsPage /></RequireClient>}</Route>
      <Route path="/portal/bookflow-setup">{() => <RequireClient><BookFlowSetupPage /></RequireClient>}</Route>
      {/* AJ-5 portal API access */}
      <Route path="/portal/api-access">{() => <RequireClient><PortalApiAccessPage /></RequireClient>}</Route>
      {/* W-AO-6d — Brand Kits portal page (QuoteQuick Pro $29 upsell) */}
      <Route path="/portal/brand-kits">{() => <RequireClient><PortalBrandKitsPage /></RequireClient>}</Route>
      <Route path="/portal/help">{() => <RequireClient><PortalHelp /></RequireClient>}</Route>
      <Route path="/portal/chat-history">{() => <RequireClient><PortalChatHistoryPage /></RequireClient>}</Route>
      <Route path="/portal/settings">{() => <RequireClient><PortalSettings /></RequireClient>}</Route>
      <Route path="/portal">{() => <RequireClient><PortalDashboard /></RequireClient>}</Route>

      <Route path="/compare/reputationshield-vs-nicejob" component={CompareNiceJob} />
      <Route path="/compare/:slug" component={ComparisonPage} />
      {/* MapGuard renders through the shared EffortelProductPage template
          (the /products/:slug route below) so all 12 product pages follow the
          same hero → trust → cards → how-it-works → proof → CTA rhythm.
          MapGuard copy lives in config/products.ts + config/product-mockups. */}
      {/* TradeLine variant comparison — internal review pages, registered before /:slug */}
      {/* TradeLine consolidation — old routes redirect to unified product */}
      <Route path="/products/assistants">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/ai-chat">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/ai-voice">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/tradeline-complete">{() => <Redirect to="/products/tradeline" />}</Route>
      {/* QuoteQuick slug consolidation */}
      <Route path="/products/quickquote">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/products/quotequick">{() => <Redirect to="/products/quickquotepro" />}</Route>
      {/* Removed products — redirect to closest active product */}
      <Route path="/products/booking-addon">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/products/fix-and-optimize">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/products/:slug">{(params) => <EffortelProductPage slug={params.slug} />}</Route>
      <Route path="/products" component={ProductIndex} />

      <Route path="/solutions/visibility" component={SolutionsVisibility} />
      <Route path="/solutions/:slug" component={SolutionPage} />

      <Route path="/demos" component={DemoCenter} />
      <Route path="/demos/socialsync" component={SocialSyncDemo} />
      <Route path="/demos/rankflow" component={RankFlowDemo} />
      <Route path="/demos/reputationshield" component={ReputationShieldDemo} />
      <Route path="/demos/:slug" component={DemoPage} />

      <Route path="/product/:slug">{(params) => <Redirect to={`/products/${params.slug}`} />}</Route>
      <Route path="/product">{() => <Redirect to="/products" />}</Route>
      <Route path="/platform">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/pricing" component={PricingUnified} />
      <Route path="/pricing/quotequick" component={QuoteQuickPricing} />
      <Route path="/plans">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/checkout/cancelled" component={CheckoutCancelled} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/signup/business" component={SignupBusinessNamePage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/services" component={MarketingServices} />
      <Route path="/bundles">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/templates" component={MarketingTemplates} />
      <Route path="/resources" component={Resources} />
      <Route path="/design-showcase" component={DesignShowcase} />
      <Route path="/about" component={About} />
      <Route path="/blog" component={Blog} />
      <Route path="/case-studies" component={CaseStudies} />

      <Route path="/demo/:templateId" component={DemoTemplate} />
      <Route path="/demo" component={MarketingDemo} />

      <Route path="/docs" component={MarketingDocs} />
      <Route path="/contact" component={MarketingContact} />
      <Route path="/privacy" component={MarketingPrivacy} />
      <Route path="/terms" component={MarketingTerms} />
      <Route path="/features/instant-quotes" component={FeatureInstantQuotes} />
      <Route path="/features/booking" component={FeatureBooking} />
      <Route path="/features/ai-employee" component={FeatureAiEmployee} />
      <Route path="/features/sms" component={FeatureSms} />
      <Route path="/features/calculator-engine" component={FeatureCalculatorEngine} />
      <Route path="/docs/embed" component={DocsEmbed} />
      <Route path="/docs/domain" component={DocsDomain} />
      <Route path="/docs/booking" component={DocsBooking} />
      <Route path="/docs/ai" component={DocsAi} />
      <Route path="/docs/mapguard" component={DocsMapguard} />
      <Route path="/docs/reputationshield" component={DocsReputationShield} />
      <Route path="/docs/webhooks" component={DocsWebhooks} />
      <Route path="/docs/troubleshooting" component={DocsTroubleshooting} />
      {/* AJ-7 API docs */}
      <Route path="/docs/api">{() => <ApiDocsPage />}</Route>
      <Route path="/dev/primitives">{() => <RequirePortal><PrimitivesPage /></RequirePortal>}</Route>
      <Route path="/dev/canvas">{() => <RequirePortal><DemoCanvas /></RequirePortal>}</Route>
      <Route path="/tools/missed-call-calculator/:trade" component={MissedCallCalculatorTrade} />
      <Route path="/tools/missed-call-calculator" component={MissedCallCalculator} />
      <Route path="/tools/quote-demo" component={QuoteCalculatorDemo} />
      <Route path="/tools/free-audit" component={FreeAudit} />
      <Route path="/tools" component={ToolsHub} />
      {/* Legacy tool routes — redirect to canonical /tools/ URLs */}
      <Route path="/missed-call-calculator">{() => <Redirect to="/tools/missed-call-calculator" />}</Route>
      <Route path="/quote-demo">{() => <Redirect to="/tools/quote-demo" />}</Route>
      <Route path="/free-audit">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/onboarding/:token" component={OnboardingForm} />
      <Route path="/review/qr/:widgetToken" component={ReviewQrLanding} />
      <Route path="/review/:token" component={ReviewFunnel} />
      <Route path="/audit/report/:id" component={SharedAuditReport} />
      <Route path="/book/:slug" component={BookingPage} />
      <Route path="/pay/:token" component={PayInvoicePage} />
      {/* Wave R3 — public shareable quote URL (snapshot pattern). */}
      <Route path="/q/:slug" component={QuoteSnapshotPage} />
      <Route path="/wizard/legacy" component={WizardLegacy} />
      <Route path="/wizard" component={Wizard} />
      <Route path="/calculator" component={Calculator} />
      <Route path="/edit-calculator" component={EditCalculator} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/dashboard" component={Dashboard} />
      {/* Redirect legacy uppercase routes to canonical lowercase */}
      <Route path="/Wizard/legacy">{() => <Redirect to="/wizard/legacy" />}</Route>
      <Route path="/Wizard">{() => <Redirect to="/wizard" />}</Route>
      <Route path="/Calculator">{() => <Redirect to="/calculator" />}</Route>
      <Route path="/EditCalculator">{() => <Redirect to="/edit-calculator" />}</Route>
      <Route path="/Leads">{() => <Redirect to="/leads" />}</Route>
      <Route path="/Dashboard">{() => <Redirect to="/dashboard" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CopilotFormProvider>
          <Toaster />
          <Router />
        </CopilotFormProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
