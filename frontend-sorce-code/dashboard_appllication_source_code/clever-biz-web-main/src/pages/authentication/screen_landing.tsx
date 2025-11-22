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
    <div className="bg-primary h-full min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="h-[127px] w-full container-header flex justify-between items-center">
          {/* The background is handled by the pseudo-element */}
          <div className="absolute top-0 left-0 right-0 bottom-0 z-0 container-header-gradient"></div>

          {/* Logo */}
          <Logo className="w-[170px] z-49" />

          {/* Navigation Buttons */}
          <div className="flex flex-row justify-center items-center gap-x-4 z-49">
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="button-landing-text px-2"
              >
                Logout
              </button>
            ) : (
              <>
                <Link to="/login" className="button-landing-text px-2">
                  Login
                </Link>
                <div className="border-l border-[#F2F2F2]/20 h-6"></div>
                <Link to="/register" className="button-landing ms-2 py-4">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero Section */}
        <section className="flex flex-col bg-gradient-to-br from-container-start to-container-end">
          <div className="h-[calc(127px_+_65px)]"></div>
          <div className="container-content self-center flex flex-col md:flex-row relative h-[898px]">
            {/* Right Container */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[712px] w-full flex flex-row">
              <div className="basis-[50%]"></div>
              {/* Hero Image */}
              <div className="basis-[50%] flex flex-row justify-end relative">
                <div className="absolute right-0 top-0 bottom-0 -left-40 flex justify-end">
                  <img src={heroImage} alt="CleverBiz" className="h-[712px]" />
                </div>
              </div>
            </div>
            {/* Left Container */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[712px] w-full flex flex-row">
              {/* Left Secion Text And Buttons */}
              <div className="basis-[45%] mt-24 flex flex-col justify-center">
                <h1 className="text-[70px] text-white font-david font-bold leading-20">
                  Dine Smarter
                  <br />
                  With Cleverbiz AI
                </h1>
                <div className="flex flex-row">
                  <p className="text-[#CECECE] mt-16 basis-[80%] font-inter leading-8 text-[16px]">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                    do eiusmod tempor incididunt ut labore et dolore magna
                    aliqua.
                  </p>
                </div>
                <SocialContactButtons className="fill-white mt-8" />
                <div className="flex-1"></div>
                <div className="border-b border-white/20 w-1/2 mb-24"></div>
              </div>
              <div className="basis-[55%]"></div>
            </div>
          </div>
        </section>
        {/* Subscription Packages Section */}
        <section className="pt-16 pb-10 flex flex-col bg-white">
          <h2 className="text-[52px] self-center font-bold text-primary font-david leading-none">
            Available Packages
          </h2>
          <div className="mt-16 container-content self-center">
            <PricingSection />
          </div>
        </section>
        {/* Frequently Ask Question */}
        <section className="pt-16 pb-10 flex flex-col bg-gradient-to-br from-container-start to-container-end">
          <h2 className="text-[52px] self-center font-bold text-white font-david leading-none">
            Frequently Asked Questions
          </h2>
          <div className="container-content self-center">
            <div className="space-y-4 mt-16">
              {/* Faq list section */}
              {faqs.map((faq, index) => (
                <Disclosure key={index} defaultOpen={index === 0} as="div">
                  {({ open }) => (
                    <>
                      {/* Expand button with question */}
                      <DisclosureButton className="flex w-full justify-between items-center p-4 text-left text-primary-text bg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md">
                        <div className="flex flex-row gap-x-2">
                          <span className="h-6 w-6">
                            <svg
                              className="h-6 w-6"
                              viewBox="0 0 34 32"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <rect
                                width="22.5882"
                                height="22.5882"
                                fill="#5661F6"
                                fillOpacity="0.2"
                              />
                              <rect
                                x="11.2939"
                                y="9.41174"
                                width="22.5882"
                                height="22.5882"
                                fill="#5661F6"
                              />
                            </svg>
                          </span>
                          <span className="text-lg font-medium">
                            {faq.question}
                          </span>
                        </div>
                        <IoChevronUpCircleOutline
                          className={cn(
                            { "transform rotate-180": !open },
                            "h-6 w-6 text-primary-text"
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
                            transition={{
                              duration: 0.3,
                              ease: [0.4, 0, 0.2, 1],
                            }}
                            className="overflow-hidden pt-0 text-primary"
                          >
                            <div className="bg-primary-text p-4 rounded-b-md">
                              {faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </Disclosure>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="container-header py-2 bg-footer text-white">
        <div className="grid grid-cols-2 md:grid-cols-3 items-center gap-y-4 md:gap-y-0 px-4">
          {/* logo */}
          <div className="flex justify-start items-center">
            <div className="text-start">
              <Logo className="text-start w-24" />
            </div>
          </div>

          {/* privacy rich text */}
          <div className="col-span-2 md:col-span-1 order-3 md:order-none flex justify-center">
            <p className="text-center text-md text-primary font-medium">
              Our{" "}
              <Link to="/privacy-policy" className="text-accent">
                Privacy
              </Link>{" "}
              statement{" "}
              <Link to="/terms-condition" className="text-accent">
                Terms and conditions
              </Link>
              .
            </p>
          </div>

          {/* follow us section */}
          <div className="flex justify-end items-center space-x-4">
            <span className="hidden lg:inline-block text-md font-medium text-primary leading-none uppercase">
              Follow us on
            </span>
            <SocialContactButtons />
          </div>
        </div>
      </footer>
    </div>
  );
};

/* Pricing Section */
const PricingSection = () => {
  return (
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 font-sf-pro">
        {/* Basic Plan */}
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm flex flex-col">
          <div className="mb-6 flex flex-col">
            <div className="mr-4 flex items-center justify-start">
              <SubscriptionIcon1 />
            </div>
            <h3 className="font-medium text-text-2 font-sf-pro text-[29px]">
              Basic
            </h3>
          </div>
          <div className="mb-4 flex items-center">
            <span className="text-[46px] font-medium leading-none text-text-2">
              $19
            </span>
            <div className="inline-flex flex-col">
              <span className="ml-2 text-text-2 line-through font-inter">
                $29
              </span>
              <span className="ml-2 text-sm text-[#475467] font-normal">
                /per month
              </span>
            </div>
          </div>
          <p className="text-[18px] text-gray-600">For solo entrepreneurs</p>
          <div className="border-t border-gray-100 my-8" />
          <ul className="mb-8 space-y-3 text-[16px] fill-checkmark">
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>2% 3rd-party payment providers</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>10 inventory locations</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>24/7 chat support</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Localized global selling (3 markets)</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>POS Lite</span>
            </li>
          </ul>
          <div className="flex-1" />
          <button className="w-full rounded-xl subscription-button border-[#1C1F54] py-3 text-center font-medium text-white transition-colors hover:bg-checkmark/20 border">
            Start 7-day free trial
          </button>
        </div>

        {/* Plus Plan */}
        <div className="rounded-lg border border-gray-200 bg-[#1C1F54] p-8 text-white shadow-lg flex flex-col relative overflow-hidden">
          <img
            className="absolute right-0 top-0 z-0"
            src={subscriptionCardOverlay}
            alt=""
          />
          <div className="mb-6 flex flex-col">
            <div className="mr-4 flex items-center justify-start">
              <SubscriptionIcon2 />
            </div>
            <h3 className="font-mediumfont-sf-pro text-[29px]">Plus</h3>
          </div>
          <div className="mb-4 flex items-center">
            <span className="text-[46px] font-medium leading-none">$199</span>
            <div className="inline-flex flex-col">
              <span className="ml-2 line-through font-inter">$129</span>
              <span className="ml-2 text-sm text-[#FCFCFD8F] font-normal">
                /per month
              </span>
            </div>
          </div>
          <p className="text-[18px] text-[#FCFCFD]">
            For more complex businesses
          </p>
          <div className="my-8" />
          <ul className="mb-8 space-y-3 fill-white">
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0 " />
              <span>Competitive rates for high-volume merchants</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Custom reports and analytics</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Priority 24/7 phone support</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Localized global selling (50 markets)</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Unlimited staff accounts</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Fully customizable checkout with 40x capacity</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>200 POS Pro</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Sell wholesale/B2B</span>
            </li>
          </ul>
          <div className="flex-1" />
          <button className="w-full rounded-xl bg-white py-3 text-center font-medium text-[#2a2a6c] transition-colors hover:bg-gray-100">
            Start 7-day free trial
          </button>
        </div>

        {/* Advanced Plan */}
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm flex flex-col">
          <div className="mb-6 flex flex-col">
            <div className="mr-4 flex items-center justify-start">
              <SubscriptionIcon3 />
            </div>
            <h3 className="font-medium text-text-2 font-sf-pro text-[29px]">
              Advanced
            </h3>
          </div>
          <div className="mb-4 flex items-center">
            <span className="text-[46px] font-medium leading-none text-text-2">
              $299
            </span>
            <div className="inline-flex flex-col">
              <span className="ml-2 text-text-2 line-through font-inter">
                $399
              </span>
              <span className="ml-2 text-sm text-[#475467] font-normal">
                /per month
              </span>
            </div>
          </div>
          <p className="text-[18px] text-gray-600">As your business scales</p>
          <div className="border-t border-gray-100 my-8" />
          <ul className="mb-8 space-y-3 fill-checkmark">
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>0.6% 3rd-party payment providers</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Custom reports and analytics</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>10 inventory locations</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>Enhanced 24/7 chat support</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>
                Localized global selling (3 markets) + add markets for $59
                USD/mo each
              </span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>15 additional staff accounts</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>10x checkout capacity</span>
            </li>
            <li className="flex items-start">
              <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />
              <span>POS Lite</span>
            </li>
          </ul>
          <div className="flex-1" />
          <button className="w-full rounded-xl subscription-button border-[#1C1F54] py-3 text-center font-medium text-white transition-colors hover:bg-checkmark/20 border">
            Start 7-day free trial
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenLanding;
