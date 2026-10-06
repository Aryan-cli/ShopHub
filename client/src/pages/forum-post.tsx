import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, Heart, MessageSquare, Loader2, Send, Edit, Trash2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ForumComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatarData: string | null; avatarType: string | null; isMerchant: boolean } | null;
}

interface ForumPostDetail {
  id: string;
  content: string;
  imageData: string | null;
  imageType: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  user: { id: string; username: string; avatarData: string | null; avatarType: string | null; isMerchant: boolean } | null;
  hasLiked: boolean;
  comments: ForumComment[];
}

export default function ForumPostPage() {
  const [, params] = useRoute("/forum/:id");
  const postId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [commentContent, setCommentContent] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editPostContent, setEditPostContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");

  const { data: post, isLoading } = useQuery<ForumPostDetail>({
    queryKey: ["/api/forum", postId],
    enabled: !!postId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const likePostMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/forum/${postId}/like`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum", postId] });
    },
    onError: () => {
      toast({ title: "Please login to like posts", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/forum/${postId}/comments`, { content });
      return response.json();
    },
    onSuccess: () => {
      setCommentContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/forum", postId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add comment", description: error.message, variant: "destructive" });
    },
  });

  const editPostMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("PATCH", `/api/forum/${postId}`, { content });
      return response.json();
    },
    onSuccess: () => {
      setEditingPost(false);
      setEditPostContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/forum", postId] });
      toast({ title: "Post updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update post", description: error.message, variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/forum/${postId}`);
    },
    onSuccess: () => {
      toast({ title: "Post deleted" });
      setLocation("/forum");
    },
    onError: () => {
      toast({ title: "Failed to delete post", variant: "destructive" });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const response = await apiRequest("PATCH", `/api/forum/comments/${id}`, { content });
      return response.json();
    },
    onSuccess: () => {
      setEditingCommentId(null);
      setEditCommentContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/forum", postId] });
      toast({ title: "Comment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update comment", description: error.message, variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/forum/comments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forum", postId] });
      toast({ title: "Comment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete comment", variant: "destructive" });
    },
  });

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentContent.trim()) {
      addCommentMutation.mutate(commentContent.trim());
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8 max-w-3xl">
          <Skeleton className="h-64" />
        </main>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container px-4 md:px-8 py-8 max-w-3xl text-center">
          <p>Post not found</p>
          <Link href="/forum">
            <Button className="mt-4">Back to Forum</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8 max-w-3xl">
        <Link href="/forum">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Forum
          </Button>
        </Link>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Avatar
                className="cursor-pointer"
                onClick={() => post.user && setLocation(`/user/${post.user.id}`)}
              >
                {post.user?.avatarData ? (
                  <AvatarImage src={post.user.avatarData} />
                ) : null}
                <AvatarFallback>{post.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold cursor-pointer hover:underline"
                      onClick={() => post.user && setLocation(`/user/${post.user.id}`)}
                    >
                      {post.user?.username}
                    </span>
                    {post.user?.isMerchant && <Badge variant="secondary">Merchant</Badge>}
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {user && post.user?.id === user.id && !editingPost && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingPost(true);
                          setEditPostContent(post.content);
                        }}
                        data-testid="button-edit-post"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this post?")) {
                            deletePostMutation.mutate();
                          }
                        }}
                        data-testid="button-delete-post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingPost ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editPostContent}
                      onChange={(e) => setEditPostContent(e.target.value)}
                      className="resize-none"
                      data-testid="input-edit-post"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => editPostMutation.mutate(editPostContent.trim())}
                        disabled={editPostMutation.isPending || !editPostContent.trim()}
                        data-testid="button-save-post"
                      >
                        {editPostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPost(false);
                          setEditPostContent("");
                        }}
                        data-testid="button-cancel-edit-post"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-lg">{post.content}</p>
                    {post.imageData && (
                      <img src={post.imageData} alt="Post image" className="mt-3 rounded-md max-h-96 object-contain" />
                    )}
                  </>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => likePostMutation.mutate()}
                    className={post.hasLiked ? "text-red-500" : ""}
                    data-testid="button-like"
                  >
                    <Heart className={`h-4 w-4 mr-1 ${post.hasLiked ? "fill-current" : ""}`} />
                    {post.likeCount}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4 inline mr-1" />
                    {post.commentCount} comments
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Comments</h2>

          {user && (
            <form onSubmit={handleAddComment} className="flex items-start gap-3">
              <Avatar>
                {user.avatarData ? (
                  <AvatarImage src={user.avatarData} />
                ) : null}
                <AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Write a comment..."
                  className="resize-none"
                  data-testid="input-comment"
                />
                <Button type="submit" disabled={addCommentMutation.isPending} data-testid="button-submit-comment">
                  {addCommentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Comment
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {post.comments && post.comments.length > 0 ? (
            <div className="space-y-4">
              {post.comments.map((comment) => (
                <Card key={comment.id} data-testid={`card-comment-${comment.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Avatar
                        className="cursor-pointer"
                        onClick={() => comment.user && setLocation(`/user/${comment.user.id}`)}
                      >
                        {comment.user?.avatarData ? (
                          <AvatarImage src={comment.user.avatarData} />
                        ) : null}
                        <AvatarFallback>{comment.user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold cursor-pointer hover:underline"
                              onClick={() => comment.user && setLocation(`/user/${comment.user.id}`)}
                            >
                              {comment.user?.username}
                            </span>
                            {comment.user?.isMerchant && <Badge variant="secondary">Merchant</Badge>}
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          {user && comment.user?.id === user.id && editingCommentId !== comment.id && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditCommentContent(comment.content);
                                }}
                                data-testid={`button-edit-comment-${comment.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this comment?")) {
                                    deleteCommentMutation.mutate(comment.id);
                                  }
                                }}
                                data-testid={`button-delete-comment-${comment.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {editingCommentId === comment.id ? (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              value={editCommentContent}
                              onChange={(e) => setEditCommentContent(e.target.value)}
                              className="resize-none"
                              data-testid={`input-edit-comment-${comment.id}`}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => editCommentMutation.mutate({ id: comment.id, content: editCommentContent.trim() })}
                                disabled={editCommentMutation.isPending || !editCommentContent.trim()}
                                data-testid={`button-save-comment-${comment.id}`}
                              >
                                {editCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditCommentContent("");
                                }}
                                data-testid={`button-cancel-edit-comment-${comment.id}`}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1">{comment.content}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No comments yet. Be the first to comment!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
