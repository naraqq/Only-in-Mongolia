import { type PostItem } from '@/components/post-card';
import { sendJson } from '@/lib/http';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';

/**
 * One post's like, save and comment count, shared by the card and the full-screen viewer so both stay in step.
 * Likes and saves update at once and roll back if the server says no.
 */
export function usePostState(post: PostItem) {
    const { auth } = usePage<SharedData>().props;
    const [liked, setLiked] = useState(post.liked);
    const [likes, setLikes] = useState(post.likes_count);
    const [saved, setSaved] = useState(post.bookmarked);
    const [comments, setComments] = useState(post.comments_count);

    async function like(want?: boolean) {
        if (!auth.user) return router.visit(route('login'));
        const was = liked;
        if (want !== undefined && want === was) return;
        setLiked(!was);
        setLikes((n) => n + (was ? -1 : 1));
        try {
            const r = await sendJson<{ liked: boolean; likes_count: number }>('POST', route('posts.like', post.id));
            setLiked(r.liked);
            setLikes(r.likes_count);
        } catch {
            setLiked(was);
            setLikes((n) => n + (was ? 1 : -1));
        }
    }

    async function save() {
        if (!auth.user) return router.visit(route('login'));
        const was = saved;
        setSaved(!was);
        try {
            setSaved((await sendJson<{ bookmarked: boolean }>('POST', route('posts.bookmark', post.id))).bookmarked);
        } catch {
            setSaved(was);
        }
    }

    return {
        liked,
        likes,
        saved,
        comments,
        setComments,
        toggleLike: () => like(),
        likeOnce: () => like(true),
        toggleSave: save,
    };
}

export type PostState = ReturnType<typeof usePostState>;
