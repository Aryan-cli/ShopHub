import { useState, useEffect, useRef, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageCircle, Send, ImagePlus, Edit, Trash2, UserPlus, Users, Loader2, Check, CheckCheck, X, ArrowLeft, ArrowDown, BellOff, Bell, Reply } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Message {
  id: string;
  content: string | null;
  contentType: string;
  attachmentData: string | null;
  attachmentType: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  parentMessageId: string | null;
  replyToContent: string | null;
  replyToUsername: string | null;
  createdAt: string;
  sender: { id: string; username: string; avatarData: string | null; avatarType: string | null } | null;
}

interface Conversation {
  id: string;
  updatedAt: string;
  otherUser: { id: string; username: string; avatarData: string | null; avatarType: string | null } | null;
  lastMessage: Message | null;
  hasUnread?: boolean;
}

interface OnlineStatus {
  [userId: string]: boolean;
}

interface TypingStatus {
  [conversationId: string]: { userId: string; username: string } | null;
}

// ============== MESSAGE ITEM COMPONENT ==============
const MessageItem = memo(function MessageItem({ 
  message, 
  isMine,
  isSeen,
  onEdit,
  onDelete,
  onReply,
}: { 
  message: Message;
  isMine: boolean;
  isSeen: boolean;
  onEdit: (msg: Message) => void;
  onDelete: (id: string) => void;
  onReply: (msg: Message) => void;
}) {
  return (
    <div className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${isMine ? "order-2" : "order-1"}`}>
        {/* Reply preview */}
        {message.replyToContent && message.replyToUsername && (
          <div className={`mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 border-primary/50 bg-muted/60 ${isMine ? "ml-4" : "mr-4"}`}>
            <p className="font-semibold text-primary/80">{message.replyToUsername}</p>
            <p className="text-muted-foreground truncate">{message.replyToContent}</p>
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 shadow-sm transition-all hover:shadow-md ${
            isMine ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none"
          }`}
        >
          {message.isDeleted ? (
            <p className="italic text-sm opacity-70">Message deleted</p>
          ) : message.contentType === "image" && message.attachmentData ? (
            <img src={message.attachmentData} alt="Image" className="max-w-full rounded" />
          ) : message.contentType === "video" && message.attachmentData ? (
            <video src={message.attachmentData} controls className="max-w-full rounded" />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
        <div className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${isMine ? "justify-end" : ""}`}>
          <span>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
          {message.isEdited && <span className="italic">(edited)</span>}
          {/* Reply button — always slightly visible */}
          {!message.isDeleted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-30 hover:opacity-100 transition-opacity"
              onClick={() => onReply(message)}
              title="Reply"
            >
              <Reply className="h-3 w-3" />
            </Button>
          )}
          {isMine && !message.isDeleted && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-30 hover:opacity-100 transition-opacity"
                onClick={() => onEdit(message)}
                title="Edit"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-30 hover:opacity-100 transition-opacity"
                onClick={() => onDelete(message.id)}
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
          {/* Delivery / seen ticks — only on own messages */}
          {isMine && !message.isDeleted && (
            isSeen
              ? <CheckCheck className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              : <Check className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
});

// ============== CHAT INPUT COMPONENT ==============
const ChatInput = memo(function ChatInput({ 
  onSendMessage,
  onTyping,
  onStopTyping,
  isPending 
}: { 
  onSendMessage: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  isPending: boolean;
}) {
  const [localMessage, setLocalMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [localMessage, adjustTextareaHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalMessage(value);

    if (value.trim().length > 0) {
      onTyping();
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        onStopTyping();
      }, 2000);
    } else {
      onStopTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (localMessage.trim()) {
        onSendMessage(localMessage.trim());
        setLocalMessage("");
        onStopTyping();
        
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
        
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
    }
  };

  return (
    <div className="flex items-end gap-2 w-full">
      <Textarea
        ref={textareaRef}
        value={localMessage}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message.."
        data-testid="input-message"
        className="flex-1 resize-none min-h-[40px] max-h-[120px] py-2"
        rows={1}
      />
      <Button 
        onClick={() => {
          if (localMessage.trim()) {
            onSendMessage(localMessage.trim());
            setLocalMessage("");
            onStopTyping();
            
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
            
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 0);
          }
        }}
        size="icon" 
        disabled={!localMessage.trim() || isPending} 
        data-testid="button-send" 
        className="flex-shrink-0 h-[40px] w-[40px]"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
});

// ============== MESSAGES LIST COMPONENT WITH PERFECT SCROLL ==============
interface MessagesListHandle {
  scrollToBottom: () => void;
}

const MessagesListInner = forwardRef<MessagesListHandle, {
  messages: Message[];
  currentUser: any;
  onEdit: (msg: Message) => void;
  onDelete: (id: string) => void;
  onReply: (msg: Message) => void;
  otherUserLastReadAt: string | null;
}>(function MessagesList(
  { messages, currentUser, onEdit, onDelete, onReply, otherUserLastReadAt },
  ref
) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialLoadDoneRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: smooth ? "smooth" : "instant" as ScrollBehavior });
    setUnreadCount(0);
    setIsAtBottom(true);
    isAtBottomRef.current = true;
  }, []);

  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  // Scroll to bottom on initial load (instant, no animation)
  useEffect(() => {
    if (containerRef.current && messages.length > 0 && !initialLoadDoneRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      initialLoadDoneRef.current = true;
      lastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
    }
  }, [messages]);

  // Track if user is at the bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = containerRef.current;
    const dist = scrollHeight - scrollTop - clientHeight;
    const atBottom = dist < 120;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  }, []);

  // Auto-scroll only if at bottom; otherwise increment unread counter
  useEffect(() => {
    if (!containerRef.current || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMessageIdRef.current !== lastMsg?.id) {
      if (isAtBottomRef.current) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 30);
      } else {
        // Only count messages from others (not my own sent messages)
        if (lastMsg.sender?.id !== currentUser?.id) {
          setUnreadCount(prev => prev + 1);
        }
      }
      lastMessageIdRef.current = lastMsg?.id ?? null;
    }
  }, [messages, currentUser]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg) => {
          const isSeen = !!(otherUserLastReadAt && new Date(otherUserLastReadAt) >= new Date(msg.createdAt));
          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isMine={msg.sender?.id === currentUser?.id}
              isSeen={isSeen}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Go to latest floating button */}
      {!isAtBottom && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button
            size="sm"
            className="rounded-full shadow-lg h-9 px-3 gap-1.5"
            onClick={() => scrollToBottom(true)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {unreadCount > 0 ? `${unreadCount} new` : "Latest"}
          </Button>
        </div>
      )}
    </div>
  );
});

const MessagesList = memo(MessagesListInner) as typeof MessagesListInner;

// ============== MAIN COMPONENT ==============
export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineStatus>({});
  const [typingStatus, setTypingStatus] = useState<TypingStatus>({});
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [readStatuses, setReadStatuses] = useState<Record<string, string | null>>({});
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef<boolean>(false);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const messagesListRef = useRef<MessagesListHandle>(null);
  const lastTypingSentRef = useRef<number>(0);
  const lastHttpTypingSentRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const httpHeartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const httpOnlinePollingRef = useRef<NodeJS.Timeout>();
  const httpTypingPollingRef = useRef<NodeJS.Timeout>();

  // Queries
  const { data: conversations, isLoading: loadingConvs } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: messages, isLoading: loadingMessages, refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: friends } = useQuery({
    queryKey: ["/api/friends"],
    enabled: !!user,
  });

  const { data: friendRequests } = useQuery({
    queryKey: ["/api/friend-requests"],
    enabled: !!user,
  });

  const { data: mutedStatus, refetch: refetchMutedStatus } = useQuery<{ isMuted: boolean }>({
    queryKey: ["/api/users", selectedConversation?.otherUser?.id, "muted"],
    enabled: !!selectedConversation?.otherUser?.id,
  });

  // ============== MUTATIONS ==============
  const toggleMuteMutation = useMutation({
    mutationFn: async ({ userId, mute }: { userId: string; mute: boolean }) => {
      if (mute) {
        await apiRequest("POST", `/api/users/${userId}/mute`);
      } else {
        await apiRequest("DELETE", `/api/users/${userId}/mute`);
      }
    },
    onSuccess: (_, { mute }) => {
      refetchMutedStatus();
      toast({ title: mute ? "User muted" : "User unmuted" });
    },
    onError: () => {
      toast({ title: "Failed to update mute status", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, parentMessageId }: { content: string; parentMessageId?: string | null }) => {
      const response = await apiRequest("POST", `/api/conversations/${selectedConversation?.id}/messages`, { content, parentMessageId });
      return response.json();
    },
    onSuccess: (newMessage) => {
      const messageWithSender = {
        ...newMessage,
        sender: {
          id: user?.id,
          username: user?.username,
          avatarData: user?.avatarData,
          avatarType: null
        }
      };
      
      setLocalMessages(prev => {
        const exists = prev.some(m => m.id === newMessage.id);
        if (exists) return prev;
        return [...prev, messageWithSender];
      });
      
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const response = await apiRequest("PATCH", `/api/messages/${id}`, { content });
      return response.json();
    },
    onSuccess: () => {
      setEditingMessage(null);
      setEditContent("");
      refetchMessages();
    },
    onError: () => {
      toast({ title: "Failed to edit message", variant: "destructive" });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/messages/${id}`);
    },
    onSuccess: () => {
      refetchMessages();
    },
    onError: () => {
      toast({ title: "Failed to delete message", variant: "destructive" });
    },
  });

  const startConversationMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const response = await apiRequest("POST", "/api/conversations", { recipientId });
      return response.json();
    },
    onSuccess: (conv) => {
      setSelectedConversation(conv);
      setShowChatOnMobile(true);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start conversation", description: error.message, variant: "destructive" });
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiRequest("POST", `/api/friend-requests/${requestId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({ title: "Friend request accepted" });
    },
  });

  const rejectFriendMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await apiRequest("POST", `/api/friend-requests/${requestId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friend-requests"] });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedConversation) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const response = await apiRequest("POST", `/api/conversations/${selectedConversation.id}/messages`, {
          content: null,
          contentType: file.type.startsWith("video/") ? "video" : "image",
          attachmentData: reader.result as string,
          attachmentType: file.type,
        });
        if (response.ok) {
          refetchMessages();
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // ============== HTTP FALLBACK HELPERS ==============
  const startHttpFallbacks = useCallback(() => {
    // HTTP heartbeat every 30s
    if (!httpHeartbeatIntervalRef.current) {
      apiRequest("POST", "/api/heartbeat").catch(() => {});
      httpHeartbeatIntervalRef.current = setInterval(() => {
        apiRequest("POST", "/api/heartbeat").catch(() => {});
      }, 30000);
    }
    // HTTP online status polling every 10s
    if (!httpOnlinePollingRef.current) {
      httpOnlinePollingRef.current = setInterval(async () => {
        if (wsConnectedRef.current) return;
        try {
          const convs = queryClient.getQueryData<Conversation[]>(["/api/conversations"]);
          const ids = (convs || []).map(c => c.otherUser?.id).filter(Boolean) as string[];
          if (ids.length === 0) return;
          const res = await apiRequest("GET", `/api/users/online-statuses?userIds=${ids.join(",")}`);
          const statuses = await res.json();
          setOnlineUsers(prev => ({ ...prev, ...statuses }));
        } catch {}
      }, 10000);
    }
  }, [queryClient]);

  const stopHttpFallbacks = useCallback(() => {
    if (httpHeartbeatIntervalRef.current) {
      clearInterval(httpHeartbeatIntervalRef.current);
      httpHeartbeatIntervalRef.current = undefined;
    }
    if (httpOnlinePollingRef.current) {
      clearInterval(httpOnlinePollingRef.current);
      httpOnlinePollingRef.current = undefined;
    }
  }, []);

  // ============== WEBSOCKET SETUP ==============
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?userId=${user.id}`);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      wsConnectedRef.current = true;
      stopHttpFallbacks();
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, 30000);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case "typing":
          setTypingStatus(prev => ({
            ...prev,
            [data.conversationId]: { 
              userId: data.userId, 
              username: data.username 
            }
          }));
          
          setTimeout(() => {
            setTypingStatus(prev => ({
              ...prev,
              [data.conversationId]: null
            }));
          }, 3000);
          break;
          
        case "stop_typing":
          setTypingStatus(prev => ({
            ...prev,
            [data.conversationId]: null
          }));
          break;
          
        case "new_message": {
          const msgConvId = data.message?.conversationId;
          if (msgConvId && msgConvId === selectedConversationRef.current?.id) {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/conversations", selectedConversationRef.current.id, "messages"] 
            });
            // We're in this conversation — mark as read so sender gets double tick instantly
            apiRequest("POST", `/api/conversations/${msgConvId}/mark-read`).catch(() => {});
          }
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          break;
        }

        case "conversation_read":
          // Other user read the conversation — update their lastReadAt so ticks flip instantly
          if (data.conversationId === selectedConversationRef.current?.id) {
            setReadStatuses(prev => ({ ...prev, [data.userId]: data.readAt }));
          }
          break;
          
        case "online_status":
          setOnlineUsers(prev => ({
            ...prev,
            [data.userId]: data.isOnline
          }));
          break;
      }
    };
    
    ws.onclose = () => {
      console.log("WebSocket disconnected — switching to HTTP fallback");
      wsConnectedRef.current = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      startHttpFallbacks();
    };

    ws.onerror = () => {
      wsConnectedRef.current = false;
      startHttpFallbacks();
    };

    wsRef.current = ws;
    
    return () => {
      ws.close();
      wsConnectedRef.current = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [user, queryClient, startHttpFallbacks, stopHttpFallbacks]);

  // ============== HTTP TYPING POLLING (when WS is down) ==============
  useEffect(() => {
    if (httpTypingPollingRef.current) {
      clearInterval(httpTypingPollingRef.current);
      httpTypingPollingRef.current = undefined;
    }
    if (!selectedConversation) return;

    httpTypingPollingRef.current = setInterval(async () => {
      if (wsConnectedRef.current) return;
      try {
        const res = await apiRequest("GET", `/api/conversations/${selectedConversation.id}/typing`);
        const data = await res.json();
        setTypingStatus(prev => ({
          ...prev,
          [selectedConversation.id]: data.isTyping
            ? { userId: data.userId, username: data.username }
            : null
        }));
      } catch {}
    }, 2000);

    return () => {
      if (httpTypingPollingRef.current) {
        clearInterval(httpTypingPollingRef.current);
        httpTypingPollingRef.current = undefined;
      }
    };
  }, [selectedConversation]);

  // Update local messages when fetched messages change
  useEffect(() => {
    if (messages) {
      setLocalMessages(messages);
    }
  }, [messages]);

  // Update ref when selected conversation changes
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // ============== TYPING INDICATORS ==============
  const handleTyping = useCallback(() => {
    if (!selectedConversationRef.current) return;
    const now = Date.now();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (now - lastTypingSentRef.current > 2000) {
        wsRef.current.send(JSON.stringify({
          type: "typing",
          conversationId: selectedConversationRef.current.id,
          receiverId: selectedConversationRef.current.otherUser?.id
        }));
        lastTypingSentRef.current = now;
      }
    } else {
      // HTTP fallback for typing
      if (now - lastHttpTypingSentRef.current > 2000) {
        apiRequest("POST", `/api/conversations/${selectedConversationRef.current.id}/typing`, { isTyping: true }).catch(() => {});
        lastHttpTypingSentRef.current = now;
      }
    }
  }, []);

  const handleStopTyping = useCallback(() => {
    if (!selectedConversationRef.current) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "stop_typing",
        conversationId: selectedConversationRef.current.id,
        receiverId: selectedConversationRef.current.otherUser?.id
      }));
    } else {
      // HTTP fallback for stop typing
      apiRequest("POST", `/api/conversations/${selectedConversationRef.current.id}/typing`, { isTyping: false }).catch(() => {});
    }
  }, []);

  // ============== CONVERSATION HANDLING ==============
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowChatOnMobile(true);
    setLocalMessages([]);
    setEditingMessage(null);
    setReplyingTo(null);
    setReadStatuses({});
    // Mark as read and fetch initial read statuses
    apiRequest("POST", `/api/conversations/${conv.id}/mark-read`).catch(() => {});
    apiRequest("GET", `/api/conversations/${conv.id}/read-status`)
      .then(r => r.json())
      .then(data => setReadStatuses(data))
      .catch(() => {});
  };

  const handleBackToList = () => {
    setShowChatOnMobile(false);
    setSelectedConversation(null);
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  const isTyping = selectedConversation && typingStatus[selectedConversation.id];
  const otherUserId = selectedConversation?.otherUser?.id;
  const otherUserLastReadAt = otherUserId ? (readStatuses[otherUserId] ?? null) : null;

  // ============== CONVERSATIONS LIST JSX ==============
  const conversationsListJsx = (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="text-lg">Conversations</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div className="h-full overflow-y-auto">
          {loadingConvs ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : conversations && conversations.length > 0 ? (
            <div className="divide-y">
              {conversations.map((conv) => {
                const isOnline = conv.otherUser ? onlineUsers[conv.otherUser.id] : false;
                return (
                  <div
                    key={conv.id}
                    className={`p-4 cursor-pointer hover-elevate ${selectedConversation?.id === conv.id ? "bg-accent" : ""}`}
                    onClick={() => handleSelectConversation(conv)}
                    data-testid={`conversation-${conv.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar>
                          {conv.otherUser?.avatarData ? (
                            <AvatarImage src={conv.otherUser.avatarData} />
                          ) : null}
                          <AvatarFallback>{conv.otherUser?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{conv.otherUser?.username}</p>
                          {conv.hasUnread && (
                            <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage?.isDeleted ? "Message deleted" : conv.lastMessage?.content || "No messages"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2" />
              <p>No conversations yet</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // ============== CHAT VIEW JSX ==============
  const chatViewJsx = (
    <Card className="h-full flex flex-col">
      {selectedConversation ? (
        <>
          <CardHeader className="border-b flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={handleBackToList}
                  data-testid="button-back-to-list"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="relative">
                  <Avatar>
                    {selectedConversation.otherUser?.avatarData ? (
                      <AvatarImage src={selectedConversation.otherUser.avatarData} />
                    ) : null}
                    <AvatarFallback>{selectedConversation.otherUser?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {selectedConversation.otherUser && onlineUsers[selectedConversation.otherUser.id] && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{selectedConversation.otherUser?.username}</CardTitle>
                    {mutedStatus?.isMuted && (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {selectedConversation.otherUser && onlineUsers[selectedConversation.otherUser.id] ? (
                    <p className="text-xs text-green-500">Online</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Offline</p>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-chat-menu">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (selectedConversation.otherUser) {
                        toggleMuteMutation.mutate({
                          userId: selectedConversation.otherUser.id,
                          mute: !mutedStatus?.isMuted
                        });
                      }
                    }}
                    data-testid="button-toggle-mute"
                  >
                    {mutedStatus?.isMuted ? (
                      <>
                        <Bell className="mr-2 h-4 w-4" />
                        Unmute Notifications
                      </>
                    ) : (
                      <>
                        <BellOff className="mr-2 h-4 w-4" />
                        Mute Notifications
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          
          {/* Messages Area */}
          <div className="flex-1 min-h-0 flex flex-col">
            {loadingMessages ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : localMessages && localMessages.length > 0 ? (
              <MessagesList
                ref={messagesListRef}
                messages={localMessages}
                currentUser={user}
                onEdit={setEditingMessage}
                onDelete={(id) => deleteMessageMutation.mutate(id)}
                onReply={setReplyingTo}
                otherUserLastReadAt={otherUserLastReadAt}
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="text-center text-muted-foreground py-8">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              </div>
            )}

            {/* Typing indicator — always reserves space to prevent layout shifts */}
            <div className="flex-shrink-0 h-8 px-4 flex items-center">
              {isTyping && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span>{selectedConversation && typingStatus[selectedConversation.id]?.username} is typing...</span>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t flex-shrink-0">
              {editingMessage ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    editMessageMutation.mutate({ id: editingMessage.id, content: editContent });
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edit message..."
                    autoFocus
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={editMessageMutation.isPending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditingMessage(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Reply preview above input */}
                  {replyingTo && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border-l-2 border-primary/50 text-sm">
                      <Reply className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-primary/80 text-xs">{replyingTo.sender?.username}</p>
                        <p className="text-muted-foreground truncate text-xs">{replyingTo.isDeleted ? "Message deleted" : (replyingTo.content || "[Media]")}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 flex-shrink-0"
                        onClick={() => setReplyingTo(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <label className="cursor-pointer flex-shrink-0 mb-1">
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                    <ChatInput
                      onSendMessage={(content) => sendMessageMutation.mutate({ content, parentMessageId: replyingTo?.id ?? null })}
                      onTyping={handleTyping}
                      onStopTyping={handleStopTyping}
                      isPending={sendMessageMutation.isPending}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          <MessageCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Select a conversation to start chatting</p>
        </div>
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8 flex flex-col h-[calc(100vh-64px)]">
        <div className="flex-shrink-0 flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Messages</h1>
          
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-friend-requests">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Friend Requests
                  {friendRequests && friendRequests.length > 0 && (
                    <Badge className="ml-2">{friendRequests.length}</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Friend Requests</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {friendRequests && friendRequests.length > 0 ? (
                    friendRequests.map((req: any) => (
                      <div key={req.id} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            {req.sender?.avatarData ? (
                              <AvatarImage src={req.sender.avatarData} />
                            ) : null}
                            <AvatarFallback>{req.sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span>{req.sender?.username}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="ghost" onClick={() => acceptFriendMutation.mutate(req.id)}>
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => rejectFriendMutation.mutate(req.id)}>
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No pending friend requests</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-friends">
                  <Users className="h-4 w-4 mr-2" />
                  Friends
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Friends</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {friends && friends.length > 0 ? (
                    friends.map((friend: any) => (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between p-3 border rounded-md hover-elevate cursor-pointer"
                        onClick={() => startConversationMutation.mutate(friend.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar>
                              {friend.avatarData ? (
                                <AvatarImage src={friend.avatarData} />
                              ) : null}
                              <AvatarFallback>{friend.username.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {onlineUsers[friend.id] && (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                            )}
                          </div>
                          <div>
                            <span className="font-medium">{friend.username}</span>
                            {friend.isMerchant && <Badge className="ml-2" variant="secondary">Merchant</Badge>}
                          </div>
                        </div>
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No friends yet</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="md:col-span-1 min-h-0">
            {conversationsListJsx}
          </div>
          <div className="md:col-span-2 min-h-0">
            {chatViewJsx}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden flex-1 min-h-0">
          {showChatOnMobile ? chatViewJsx : conversationsListJsx}
        </div>
      </main>
    </div>
  );
}
