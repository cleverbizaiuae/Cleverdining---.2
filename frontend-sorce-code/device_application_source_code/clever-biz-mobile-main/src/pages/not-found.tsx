import { useState, useEffect } from "react";
import {  ArrowLeft, } from "lucide-react";
import { Link, useNavigate } from "react-router";

export const NotFoundPage = () => {
  const [glitchText, setGlitchText] = useState("404");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();
  useEffect(() => {
    const glitchChars = "!<>-_\\/[]{}—=+*^?#________";
    const originalText = "404";

    const glitchInterval = setInterval(() => {
      if (Math.random() < 0.1) {
        const glitched = originalText
          .split("")
          .map((char) =>
            Math.random() < 0.3
              ? glitchChars[Math.floor(Math.random() * glitchChars.length)]
              : char
          )
          .join("");
        setGlitchText(glitched);

        setTimeout(() => setGlitchText(originalText), 100);
      }
    }, 200);

    const handleMouseMove = (e:any) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      clearInterval(glitchInterval);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const floatingElements = Array.from({ length: 6 }, (_, i) => (
    <div
      key={i}
      className="absolute w-2 h-2 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-20 animate-pulse"
      style={{
        left: `${20 + i * 15}%`,
        top: `${30 + i * 8}%`,
        animationDelay: `${i * 0.5}s`,
        animationDuration: `${2 + i * 0.3}s`,
      }}
    />
  ));
  const handlegoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-30">{floatingElements}</div>

      {/* Cursor follower effect */}
      <div
        className="fixed w-6 h-6 bg-purple-500 rounded-full opacity-20 pointer-events-none z-50 transition-all duration-300 ease-out"
        style={{
          left: mousePos.x - 12,
          top: mousePos.y - 12,
          transform: "scale(0.8)",
        }}
      />

      <div className="container mx-auto px-4 min-h-screen flex items-center justify-center relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          {/* Main 404 Section */}
          <div className="relative mb-8">
            <h1
              className="text-9xl md:text-[12rem] font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 select-none relative z-10"
              style={{
                textShadow: "0 0 30px rgba(168, 85, 247, 0.5)",
                fontFamily: "monospace",
              }}
            >
              {glitchText}
            </h1>

            {/* Glitch effect overlay */}
            <div className="absolute inset-0 text-9xl md:text-[12rem] font-black text-red-500 opacity-30 animate-pulse select-none">
              404
            </div>

            {/* Geometric decoration */}
            <div className="absolute -top-4 -left-4 w-8 h-8 border-2 border-purple-400 rotate-45 animate-spin opacity-60" />
            <div className="absolute -bottom-4 -right-4 w-6 h-6 border-2 border-pink-400 rotate-45 animate-bounce opacity-60" />
          </div>

          {/* Error message */}
          <div className="mb-8 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-100 mb-4">
              Oops! Page Not Found
            </h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
              The page you're looking for seems to have vanished into the
              digital void. Don't worry though – even the best explorers
              sometimes take a wrong turn.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            {/* <button className="group bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 px-8 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-2xl flex items-center gap-3 min-w-[200px]">
              <Home size={20} />
              <span>Back to Home</span>
              <div className="w-0 group-hover:w-6 h-0.5 bg-white transition-all duration-300" />
            </button> */}

            <Link
              onClick={handlegoBack}
              to={"/dashboard"}
              className="group border-2 border-purple-400 text-purple-400 hover:bg-purple-400 hover:text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 flex items-center gap-3 min-w-[200px]"
            >
              <ArrowLeft size={20} />
              <span>Go Back</span>
            </Link>
          </div>

          {/* Search section */}
          {/* <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-2xl mb-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-200">
              Looking for something specific?
            </h3>
            <div className="relative max-w-md mx-auto">
              <input
                type="text"
                placeholder="Search our site..."
                className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 pl-12 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300"
              />
              <Search
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
            </div>
          </div>

          {/* Quick links */}
          {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto mb-8">
            {[
              {
                icon: Home,
                title: "Homepage",
                desc: "Start fresh from our main page",
              },
              {
                icon: RefreshCw,
                title: "Refresh",
                desc: "Try reloading this page",
              },
              {
                icon: Mail,
                title: "Contact Us",
                desc: "Get help from our support team",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="group bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-purple-400/50 transition-all duration-300 transform hover:scale-105 cursor-pointer"
              >
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mb-4 mx-auto group-hover:rotate-12 transition-transform duration-300">
                  <item.icon size={24} className="text-white" />
                </div>
                <h4 className="font-semibold text-white mb-2">{item.title}</h4>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>  */}

          {/* Footer message */}
          <div className="text-center text-gray-400">
            <p className="text-sm">
              Error Code: 404 | If this problem persists, please contact our
              technical support team.
            </p>
          </div>
        </div>
      </div>

      {/* Additional decorative elements */}
      <div className="absolute top-20 left-10 w-20 h-20 border border-purple-400/30 rounded-full animate-pulse" />
      <div className="absolute bottom-20 right-10 w-16 h-16 border border-pink-400/30 rounded-full animate-bounce" />
      <div className="absolute top-1/2 left-0 w-32 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-pulse" />
      <div className="absolute top-1/3 right-0 w-24 h-0.5 bg-gradient-to-l from-transparent via-pink-400 to-transparent animate-pulse" />
    </div>
  );
};
