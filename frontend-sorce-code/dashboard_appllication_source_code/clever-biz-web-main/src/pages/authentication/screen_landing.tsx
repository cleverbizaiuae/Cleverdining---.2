import {
  Logo,
  SocialContactButtons,
  SubscriptionIcon1,
  SubscriptionIcon2,
  SubscriptionIcon3,
} from "../../components/utilities";
import heroImage from "../../assets/hero-image-1.webp";
import subscriptionCardOverlay from "../../assets/subscription-card-overlay.webp";
import { Link, useNavigate } from "react-router";
import { Disclosure, DisclosureButton } from "@headlessui/react";
import { IoChevronUpCircleOutline } from "react-icons/io5";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { faqs } from "@/data";
import { CheckCircle } from "@/components/icons";
export const getAccessToken = () => localStorage.getItem("accessToken");
export const getUserInfo = () =>
  JSON.parse(localStorage.getItem("userInfo") || "{}");

const ScreenLanding = () => {
  const navigate = useNavigate();
  const isLoggedIn =
    localStorage.getItem("accessToken") && localStorage.getItem("refreshToken");

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userInfo");
    // Optional: redirect to home or login
    navigate("/login");
  };

  return (
    <div className="bg-white h-full min-h-screen flex flex-col font-inter selection:bg-[#0055FE] selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="h-[80px] w-full container mx-auto px-6 flex justify-between items-center">
          {/* Logo */}
          <Logo className="w-[170px] z-49" />

          {/* Navigation Buttons */}
          <div className="flex flex-row justify-center items-center gap-x-4">
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="px-6 py-2.5 rounded-full bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium shadow-lg shadow-blue-500/20 transition-all duration-300"
              >
                Logout
              </button>
            ) : (
              <>
                <Link to="/login" className="px-6 py-2.5 rounded-full bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium shadow-lg shadow-blue-500/20 transition-all duration-300">
                  Login
                </Link>
                {/* <div className="border-l border-slate-200 h-6"></div> */}
                <Link to="/register" className="text-slate-500 hover:text-[#0055FE] font-medium transition-colors">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero Section */}
        <section className="relative flex flex-col pt-32 pb-20 bg-white overflow-hidden">
          {/* Background Blur Spot */}
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-50 blur-[120px] rounded-full opacity-60 -z-10 translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

          <div className="container mx-auto px-6 flex flex-col md:flex-row items-center relative gap-12">

            {/* Left Content */}
            <div className="flex-1 flex flex-col items-start z-10">

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100/80 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0055FE] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0055FE]"></span>
                </span>
                <span className="text-xs font-semibold text-[#0055FE] uppercase tracking-wide">AI-Powered Dining</span>
              </div>

              <h1 className="text-[56px] md:text-[64px] font-bold leading-[1.1] text-slate-900 mb-6">
                Dine Smarter With <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0055FE] to-cyan-500">
                  Cleverbiz AI
                </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-lg leading-relaxed">
                Revolutionize your restaurant management with intelligent insights, seamless ordering, and automated workflows.
              </p>

              <div className="flex items-center gap-4">
                <Link to="/register" className="px-8 py-4 rounded-full bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold text-lg shadow-xl shadow-blue-600/20 hover:shadow-blue-600/30 hover:-translate-y-0.5 transition-all duration-300">
                  Get Started Free
                </Link>
                <div className="h-full w-[1px] bg-slate-200 mx-2"></div>
                <SocialContactButtons className="text-slate-400 hover:text-[#0055FE] transition-colors" />
              </div>

            </div>

            {/* Right Hero Image Card */}
            <div className="flex-1 relative w-full flex justify-end">
              <div className="relative z-10 rounded-2xl border border-slate-200 shadow-2xl shadow-blue-100/50 overflow-hidden bg-white max-w-[600px] w-full hover:shadow-blue-200/50 transition-shadow duration-500">
                <img src={heroImage} alt="Dashboard Preview" className="w-full h-auto object-cover" />

                {/* Image Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent"></div>

                {/* Floating QR Card Mockup */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-xl border border-slate-100 rounded-xl p-4 shadow-lg flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl">⚡️</div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Instant Table Ordering</h4>
                    <p className="text-xs text-slate-500">Scan QR & Order in seconds</p>
                  </div>
                </div>

                {/* Floating Stats Card (Top Left) */}
                <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md border border-slate-100 rounded-lg py-2 px-3 shadow-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-xs font-bold text-slate-800">System Active</span>
                </div>
              </div>

              {/* Decorative blobs */}
              <div className="absolute -top-12 -right-12 w-64 h-64 bg-cyan-100 rounded-full blur-3xl opacity-40 -z-10"></div>
              <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-40 -z-10"></div>
            </div>

          </div>
        </section>
        {/* Subscription Packages Section */}
        <section className="pt-24 pb-20 flex flex-col bg-slate-50 border-t border-slate-200">
          <span className="self-center font-bold text-[#0055FE] uppercase tracking-wide text-sm mb-4">Pricing Plans</span>
          <h2 className="text-[42px] self-center font-bold text-slate-900 leading-none mb-4">
            Available Packages
          </h2>
          <p className="self-center text-slate-500 text-lg mb-16">Choose the perfect plan for your business</p>

          <div className="container mx-auto px-6">
            <PricingSection />
          </div>
        </section>

        {/* Frequently Ask Question */}
        <section className="pt-24 pb-20 flex flex-col bg-white border-t border-slate-200">
          <h2 className="text-[42px] self-center font-bold text-slate-900 leading-none mb-16">
            Frequently Asked Questions
          </h2>
          <div className="container mx-auto px-6 max-w-4xl">
            <div className="space-y-4">
              {/* Faq list section */}
              {faqs.map((faq, index) => (
                <Disclosure key={index} defaultOpen={index === 0} as="div">
                  {({ open }) => (
                    <div className="border border-slate-200 rounded-lg overflow-hidden transition-all duration-300 hover:border-slate-300 hover:shadow-sm">
                      {/* Expand button with question */}
                      <DisclosureButton className={cn(
                        "flex w-full justify-between items-center p-6 text-left focus:outline-none transition-colors duration-200",
                        open ? "bg-slate-50" : "bg-white hover:bg-slate-50"
                      )}>
                        <div className="flex flex-row gap-x-4 items-center">
                          <span className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-full transition-colors",
                            open ? "bg-blue-100 text-[#0055FE]" : "bg-slate-100 text-slate-400"
                          )}>
                            <span className="text-sm font-bold">Q</span>
                          </span>
                          <span className={cn(
                            "text-lg font-medium transition-colors",
                            open ? "text-[#0055FE]" : "text-slate-800"
                          )}>
                            {faq.question}
                          </span>
                        </div>
                        <IoChevronUpCircleOutline
                          className={cn(
                            "h-6 w-6 transition-transform duration-300",
                            open ? "transform rotate-180 text-[#0055FE]" : "text-slate-400"
                          )}
                        />
                      </DisclosureButton>

                      {/* Expandable container with answer */}
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            key="content"
                            initial="collapsed"
                            animate="open"
                            exit="collapsed"
                            variants={{
                              open: { height: "auto", opacity: 1 },
                              collapsed: { height: 0, opacity: 0 },
                            }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden bg-slate-50 border-t border-slate-100"
                          >
                            <div className="p-6 pt-2 text-slate-600 leading-relaxed pl-[4.5rem]">
                              {faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </Disclosure>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 bg-slate-100 border-t border-slate-200 text-slate-500 font-inter">
        <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

          {/* Logo */}
          <div className="flex justify-start md:justify-start">
            <Logo className="w-24 opacity-80 grayscale hover:grayscale-0 transition-all duration-300" />
          </div>

          {/* Privacy/Links */}
          <div className="flex justify-center text-sm font-medium">
            <p className="text-center">
              &copy; {new Date().getFullYear()} Cleverbiz AI.{" "}
              <Link to="/privacy-policy" className="text-slate-600 hover:text-[#0055FE] transition-colors mx-1">Privacy</Link>
              &bull;
              <Link to="/terms-condition" className="text-slate-600 hover:text-[#0055FE] transition-colors mx-1">Terms</Link>
            </p>
          </div>

          {/* Social */}
          <div className="flex justify-center md:justify-end items-center gap-4">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Follow Us</span>
            <SocialContactButtons className="text-slate-400 hover:text-[#0055FE] transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
};

/* Pricing Section */
const PricingSection = () => {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 font-inter items-start">
      {/* Basic Plan */}
      <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50 hover:border-blue-100 hover:shadow-blue-100 transition-all duration-300 group flex flex-col h-full">
        <div className="mb-6 flex flex-col">
          <div className="mb-4 inline-flex self-start p-3 rounded-xl bg-blue-50 text-[#0055FE]">
            <SubscriptionIcon1 />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Basic</h3>
          <p className="text-slate-500 mt-2">For solo entrepreneurs</p>
        </div>

        <div className="mb-8 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-slate-900">$19</span>
          <span className="text-slate-400 line-through text-lg">$29</span>
          <span className="text-slate-500">/mo</span>
        </div>

        <div className="border-t border-slate-100 my-6" />

        <ul className="mb-8 space-y-4 text-slate-600 flex-1">
          {[
            "2% 3rd-party payment providers",
            "10 inventory locations",
            "24/7 chat support",
            "Localized global selling (3 markets)",
            "POS Lite"
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-[#0055FE]">
                <CheckCircle className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-medium">{item}</span>
            </li>
          ))}
        </ul>

        <button className="w-full py-3.5 rounded-xl bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold shadow-lg shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5">
          Start free trial
        </button>
      </div>

      {/* Plus Plan (Highligted) */}
      <div className="relative rounded-2xl p-8 shadow-2xl shadow-blue-900/20 bg-gradient-to-br from-[#0055FE] to-[#0047D1] text-white transform md:-translate-y-4 border border-blue-500/30 flex flex-col h-full z-10">

        {/* Overlay Image */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 blur-3xl rounded-full"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/10 to-transparent"></div>
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="mb-6 flex flex-col">
            <div className="mb-4 inline-flex self-start p-3 rounded-xl bg-white/20 backdrop-blur-sm text-white">
              <SubscriptionIcon2 />
            </div>
            <h3 className="text-2xl font-bold">Plus</h3>
            <p className="text-blue-100 mt-2">For growing businesses</p>
          </div>

          <div className="mb-8 flex items-baseline gap-2">
            <span className="text-4xl font-bold">$199</span>
            <span className="text-blue-200 line-through text-lg">$129</span>
            <span className="text-blue-100/80">/mo</span>
          </div>

          <div className="border-t border-white/20 my-6" />

          <ul className="mb-8 space-y-4 text-blue-50 flex-1">
            {[
              "Competitive rates for high-volume",
              "Custom reports and analytics",
              "Priority 24/7 phone support",
              "Localized global selling (50 markets)",
              "Unlimited staff accounts",
              "Customizable checkout (40x)",
              "200 POS Pro locations",
              "Sell wholesale/B2B"
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 group">
                <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-blue-400/30 flex items-center justify-center text-white group-hover:bg-white group-hover:text-[#0055FE] transition-colors">
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-medium">{item}</span>
              </li>
            ))}
          </ul>

          <button className="w-full py-3.5 rounded-xl bg-white hover:bg-blue-50 text-[#0055FE] font-bold shadow-lg transition-all duration-300 hover:-translate-y-0.5">
            Start free trial
          </button>
        </div>
      </div>

      {/* Advanced Plan */}
      <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50 hover:border-blue-100 hover:shadow-blue-100 transition-all duration-300 group flex flex-col h-full">
        <div className="mb-6 flex flex-col">
          <div className="mb-4 inline-flex self-start p-3 rounded-xl bg-blue-50 text-[#0055FE]">
            <SubscriptionIcon3 />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Advanced</h3>
          <p className="text-slate-500 mt-2">As your business scales</p>
        </div>

        <div className="mb-8 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-slate-900">$299</span>
          <span className="text-slate-400 line-through text-lg">$399</span>
          <span className="text-slate-500">/mo</span>
        </div>

        <div className="border-t border-slate-100 my-6" />

        <ul className="mb-8 space-y-4 text-slate-600 flex-1">
          {[
            "0.6% 3rd-party payment fees",
            "Advanced custom reports",
            "10 inventory locations",
            "Enhanced 24/7 chat support",
            "Localized global selling (3 markets)",
            "15 additional staff accounts",
            "10x checkout capacity",
            "POS Lite included"
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-[#0055FE]">
                <CheckCircle className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm font-medium">{item}</span>
            </li>
          ))}
        </ul>

        <button className="w-full py-3.5 rounded-xl bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold shadow-lg shadow-blue-500/20 transition-all duration-300 hover:-translate-y-0.5">
          Start free trial
        </button>
      </div>
    </div>
  );
};

export default ScreenLanding;
