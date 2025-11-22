import { Phone, PhoneOff } from "lucide-react";
import calling from "../../assets/Audio/calling.mp3";
import ringning from "../../assets/Audio/ringing.mp3";

export default function CallerModal({
  handleAnswerCall,
  handleEndCall,
  response,
  email,
}) {
console.log(response, "response in caller modal");
  return (
    <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-3xl p-8 w-80 text-center text-white shadow-2xl">
        {/* Contact Info */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-gray-300 mb-1">
            Margherita Pizza and Chicken
          </h2>
          <p className="text-sm text-gray-400">Store</p>
        </div>

        {/* Call Timer */}
        <div className="mb-12">
          <p className="text-sm text-gray-400 mb-1">Call time</p>
          <p className="text-lg font-medium text-gray-300">Outgoing call</p>
        </div>

        {/* Call Controls */}
        <div className="flex justify-center space-x-12">
          {/* Answer/Accept Call Button */}
          {response.from !== email && (
            <button
              onClick={() =>
                handleAnswerCall(response.call_id, response.device_id)
              }
              className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
            >
              <Phone className="w-6 h-6 text-white" />
            </button>
          )}

          {response.from === email && response.action === "incoming_call" && (
            <audio src={ringning} autoPlay loop className="opacity-0"></audio>
          )}
          {response.action === "incoming_call" && (
            <audio src={calling} autoPlay loop className="opacity-0"></audio>
          )}

          {/* End Call Button */}
          <button
            onClick={() => handleEndCall(response.call_id, response.device_id)}
            className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
