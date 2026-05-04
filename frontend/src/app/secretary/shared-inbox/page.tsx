"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { MessagingConversation, SendHumanMessageRequest } from '@/types/messaging';
import { User, Bot, Send, ArrowLeft, MessageSquare, ShieldAlert } from 'lucide-react';

export default function SharedInbox() {
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<MessagingConversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const response = await api.get<MessagingConversation[]>('/messaging/conversations');
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to load conversations', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleControl(id: string, currentControl: string) {
    const newControl = currentControl === 'ai' ? 'human' : 'ai';
    try {
      await api.patch(`/messaging/conversations/${id}/control`, { control: newControl });
      await loadConversations();
      if (selectedConv?.id === id) {
        setSelectedConv({ ...selectedConv, control: newControl });
      }
    } catch (error) {
      alert('Failed to toggle control');
    }
  }

  async function sendMessage() {
    if (!selectedConv || !messageText) return;
    
    try {
      const payload: SendHumanMessageRequest = {
        text: messageText,
        channel: selectedConv.channel,
        chat_id: selectedConv.id, // Note: In a real scenario, we'd use the patient's channel_id
      };
      await api.post(`/messaging/conversations/${selectedConv.id}/send`, payload);
      setMessageText('');
      alert('Message sent successfully');
    } catch (error) {
      alert('Failed to send message');
    }
  }

  if (loading) return <div className="p-8 text-center">Loading Shared Inbox...</div>;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50">
      {/* Conversation List */}
      <div className="w-1/3 border-r bg-white flex flex-col">
        <div className="p-4 border-b bg-gray-100 font-bold flex items-center gap-2">
          <MessageSquare size={20} />
          Active Conversations
        </div>
        <div className="overflow-y-auto flex-1">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No active conversations</div>
          ) : (
            conversations.map(conv => (
              <div 
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className={`p-4 border-b cursor-pointer transition-colors ${selectedConv?.id === conv.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">Patient ID: {conv.patient_id?.slice(0,8)}...</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${conv.channel === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {conv.channel.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {conv.control === 'ai' ? <Bot size={12} /> : <User size={12} />}
                  <span>Control: {conv.control.toUpperCase()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            <div className="p-4 border-b bg-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-gray-200 p-2 rounded-full">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="font-bold">Conversation {selectedConv.id.slice(0,8)}</h3>
                  <p className="text-xs text-gray-500">{selectedConv.channel} | Started: {new Date(selectedConv.started_at).toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={() => toggleControl(selectedConv.id, selectedConv.control)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedConv.control === 'ai' 
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <ShieldAlert size={16} />
                {selectedConv.control === 'ai' ? 'Take Control (Human)' : 'Return to AI'}
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-[#e5ddd5]">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="text-center text-xs text-gray-500 bg-white/50 rounded-full py-1 px-3 w-fit mx-auto mb-4">
                  {selectedConv.control === 'human' 
                    ? 'You are now in control of this conversation' 
                    : 'AI is currently responding to this user'}
                </div>
                {/* Messages would be fetched here in a real app */}
                <div className="text-center text-gray-400 italic text-sm">
                  Conversation history is available in the CRM patient record.
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t">
              <div className="max-w-3xl mx-auto flex gap-3">
                <input 
                  type="text" 
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type your reply..."
                  className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={selectedConv.control === 'ai'}
                />
                <button 
                  onClick={sendMessage}
                  disabled={selectedConv.control === 'ai' || !messageText}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
