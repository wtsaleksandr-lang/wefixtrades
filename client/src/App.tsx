import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Wizard from "@/pages/wizard";
import Calculator from "@/pages/calculator";
import EditCalculator from "@/pages/edit-calculator";
import LeadsPage from "@/pages/leads";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import MarketingHome from "@/pages/marketing/home";
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
import DocsWebhooks from "@/pages/marketing/docs/webhooks";
import DocsTroubleshooting from "@/pages/marketing/docs/troubleshooting";
import SolutionsVisibility from "@/pages/marketing/solutions-visibility";
import FreeAudit from "@/pages/marketing/FreeAudit";
import MissedCallCalculator from "@/pages/marketing/missed-call-calculator";
import MissedCallCalculatorTrade from "@/pages/marketing/missed-call-calculator-trade";
import QuoteCalculatorDemo from "@/pages/marketing/quote-calculator-demo";
import ToolsHub from "@/pages/marketing/tools-hub";
import SharedAuditReport from "@/pages/marketing/SharedAuditReport";
import CompareNiceJob from "@/pages/marketing/CompareNiceJob";
import NewProductPage from "@/pages/products/ProductPage";
import MapGuardPage from "@/pages/products/mapguard";
import SolutionPage from "@/pages/solutions/SolutionPage";
import DemoCenter from "@/pages/demos/DemoCenter";
import DemoPage from "@/pages/demos/DemoPage";
import PricingNew from "@/pages/PricingNew";
import Plans from "@/pages/Plans";
import PricingUnified from "@/pages/PricingUnified";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancelled from "@/pages/CheckoutCancelled";
import Resources from "@/pages/Resources";
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
import BillingPage from "@/pages/admin/BillingPage";
import ServicesPage from "@/pages/admin/ServicesPage";
import MapguardDashboard from "@/pages/admin/MapguardDashboard";
import ReviewsPage from "@/pages/admin/ReviewsPage";
import RankFlowOpsPage from "@/pages/admin/RankFlowOpsPage";
import ProfilePage from "@/pages/admin/ProfilePage";
import SettingsPage from "@/pages/admin/SettingsPage";
import ChangePasswordPage from "@/pages/admin/ChangePasswordPage";
import SocialSyncOpsPage from "@/pages/admin/SocialSyncOpsPage";
import SalesPipelinePage from "@/pages/admin/SalesPipelinePage";
import OnboardingForm from "@/pages/OnboardingForm";
import ReviewFunnel from "@/pages/ReviewFunnel";
import ReviewQrLanding from "@/pages/ReviewQrLanding";
import RequireClient from "@/components/auth/RequireClient";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalServices from "@/pages/portal/PortalServices";
import PortalReviews from "@/pages/portal/PortalReviews";
import PortalWidget from "@/pages/portal/PortalWidget";
import PortalServiceDetail from "@/pages/portal/PortalServiceDetail";
import PortalBilling from "@/pages/portal/PortalBilling";
import PortalSettings from "@/pages/portal/PortalSettings";
import PortalOnboarding from "@/pages/portal/PortalOnboarding";
import PortalHelp from "@/pages/portal/PortalHelp";
import PortalTicketDetail from "@/pages/portal/PortalTicketDetail";
import SupportInboxPage from "@/pages/admin/SupportInboxPage";
import SupportTicketDetailPage from "@/pages/admin/SupportTicketDetailPage";
import PortalMapguard from "@/pages/portal/PortalMapguard";
import PortalReputation from "@/pages/portal/PortalReputation";
import SocialSyncSetup from "@/pages/portal/SocialSyncSetup";
import PortalSocialSync from "@/pages/portal/PortalSocialSync";
import PortalRankFlow from "@/pages/portal/PortalRankFlow";
import ResetPasswordPage from "@/pages/ResetPassword";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MarketingHome} />

      <Route path="/admin/ai">{() => <RequirePortal><AiDashboard /></RequirePortal>}</Route>
      <Route path="/admin/crm/sales">{() => <RequirePortal><SalesPipelinePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/socialsync">{() => <RequirePortal><SocialSyncOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/clients/:id">{() => <RequirePortal><ClientDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/clients">{() => <RequirePortal><ClientsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/inbox">{() => <RequirePortal><InboxPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/billing">{() => <RequirePortal><BillingPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/suppliers">{() => <RequirePortal><SuppliersPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/rankflow">{() => <RequirePortal><RankFlowOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support/:id">{() => <RequirePortal><SupportTicketDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support">{() => <RequirePortal><SupportInboxPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/services">{() => <RequirePortal><ServicesPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/mapguard">{() => <RequirePortal><MapguardDashboard /></RequirePortal>}</Route>
      <Route path="/admin/crm/reviews">{() => <RequirePortal><ReviewsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/profile">{() => <RequirePortal><ProfilePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/settings">{() => <RequirePortal><SettingsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/change-password">{() => <RequirePortal><ChangePasswordPage /></RequirePortal>}</Route>
      <Route path="/admin/crm">{() => <RequirePortal><CrmOverview /></RequirePortal>}</Route>

      {/* Client portal */}
      <Route path="/portal/onboarding/:id">{() => <RequireClient><PortalOnboarding /></RequireClient>}</Route>
      <Route path="/portal/services/:id">{() => <RequireClient><PortalServiceDetail /></RequireClient>}</Route>
      <Route path="/portal/mapguard">{() => <RequireClient><PortalMapguard /></RequireClient>}</Route>
      <Route path="/portal/services">{() => <RequireClient><PortalServices /></RequireClient>}</Route>
      <Route path="/portal/reviews/widget">{() => <RequireClient><PortalWidget /></RequireClient>}</Route>
      <Route path="/portal/reviews">{() => <RequireClient><PortalReviews /></RequireClient>}</Route>
      <Route path="/portal/rankflow">{() => <RequireClient><PortalRankFlow /></RequireClient>}</Route>
      <Route path="/portal/billing">{() => <RequireClient><PortalBilling /></RequireClient>}</Route>
      <Route path="/portal/help/tickets/:id">{() => <RequireClient><PortalTicketDetail /></RequireClient>}</Route>
      <Route path="/portal/socialsync-setup">{() => <RequireClient><SocialSyncSetup /></RequireClient>}</Route>
      <Route path="/portal/socialsync">{() => <RequireClient><PortalSocialSync /></RequireClient>}</Route>
      <Route path="/portal/reputation">{() => <RequireClient><PortalReputation /></RequireClient>}</Route>
      <Route path="/portal/help">{() => <RequireClient><PortalHelp /></RequireClient>}</Route>
      <Route path="/portal/settings">{() => <RequireClient><PortalSettings /></RequireClient>}</Route>
      <Route path="/portal">{() => <RequireClient><PortalDashboard /></RequireClient>}</Route>

      <Route path="/compare/reputationshield-vs-nicejob" component={CompareNiceJob} />
      <Route path="/products/mapguard" component={MapGuardPage} />
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
      <Route path="/products/:slug" component={NewProductPage} />
      <Route path="/products" component={ProductIndex} />

      <Route path="/solutions/visibility" component={SolutionsVisibility} />
      <Route path="/solutions/:slug" component={SolutionPage} />

      <Route path="/demos" component={DemoCenter} />
      <Route path="/demos/:slug" component={DemoPage} />

      <Route path="/product/:slug">{(params) => <Redirect to={`/products/${params.slug}`} />}</Route>
      <Route path="/product">{() => <Redirect to="/products" />}</Route>
      <Route path="/platform" component={MarketingProduct} />
      <Route path="/pricing" component={PricingUnified} />
      <Route path="/pricing/quotequick" component={QuoteQuickPricing} />
      <Route path="/plans">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/checkout/cancelled" component={CheckoutCancelled} />
      <Route path="/login" component={LoginPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/services" component={MarketingServices} />
      <Route path="/bundles">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/templates" component={MarketingTemplates} />
      <Route path="/resources" component={Resources} />
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
      <Route path="/docs/webhooks" component={DocsWebhooks} />
      <Route path="/docs/troubleshooting" component={DocsTroubleshooting} />
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
      <Route path="/wizard" component={Wizard} />
      <Route path="/calculator" component={Calculator} />
      <Route path="/edit-calculator" component={EditCalculator} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/dashboard" component={Dashboard} />
      {/* Redirect legacy uppercase routes to canonical lowercase */}
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
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
