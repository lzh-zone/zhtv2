/* eslint-disable @typescript-eslint/no-explicit-any */

import { CheckCircle, Heart, Link, PlayCircleIcon } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import { ImagePlaceholder } from '@/components/ImagePlaceholder';

interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  progress?: number;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: string;
  onDelete?: () => void;
  rate?: string;
  items?: SearchResult[];
  type?: string;
}

export default function VideoCard({
  id,
  title = '',
  query = '',
  poster = '',
  episodes,
  source,
  source_name,
  progress = 0,
  year,
  from,
  currentEpisode,
  douban_id,
  onDelete,
  rate,
  items,
  type = '',
}: VideoCardProps) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isAggregate = from === 'search' && !!items?.length;

  const aggregateData = useMemo(() => {
    if (!isAggregate || !items) return null;
    const countMap = new Map<string | number, number>();
    const episodeCountMap = new Map<number, number>();
    items.forEach((item) => {
      if (item.douban_id && item.douban_id !== 0) {
        countMap.set(item.douban_id, (countMap.get(item.douban_id) || 0) + 1);
      }
      const len = item.episodes?.length || 0;
      if (len > 0) {
        episodeCountMap.set(len, (episodeCountMap.get(len) || 0) + 1);
      }
    });

    const getMostFrequent = <T extends string | number>(
      map: Map<T, number>
    ) => {
      let maxCount = 0;
      let result: T | undefined;
      map.forEach((cnt, key) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          result = key;
        }
      });
      return result;
    };

    return {
      first: items[0],
      mostFrequentDoubanId: getMostFrequent(countMap),
      mostFrequentEpisodes: getMostFrequent(episodeCountMap) || 0,
    };
  }, [isAggregate, items]);

  const actualTitle = aggregateData?.first.title ?? title;
  const actualPoster = aggregateData?.first.poster ?? poster;
  const actualSource = aggregateData?.first.source ?? source;
  const actualId = aggregateData?.first.id ?? id;
  const actualDoubanId = String(
    aggregateData?.mostFrequentDoubanId ?? douban_id
  );
  const actualEpisodes = aggregateData?.mostFrequentEpisodes ?? episodes;
  const actualYear = aggregateData?.first.year ?? year;
  const actualQuery = query || '';
  const actualSearchType = isAggregate
    ? aggregateData?.first.episodes?.length === 1
      ? 'movie'
      : 'tv'
    : type;

  // 获取收藏状态
  useEffect(() => {
    if (from === 'douban' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        throw new Error('检查收藏状态失败');
      }
    };

    fetchFavoriteStatus();

    // 监听收藏状态更新事件
    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        // 检查当前项目是否在新的收藏列表中
        const isNowFavorited = !!newFavorites[storageKey];
        setFavorited(isNowFavorited);
      }
    );

    return unsubscribe;
  }, [from, actualSource, actualId]);

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from === 'douban' || !actualSource || !actualId) return;
      try {
        if (favorited) {
          // 如果已收藏，删除收藏
          await deleteFavorite(actualSource, actualId);
          setFavorited(false);
        } else {
          // 如果未收藏，添加收藏
          await saveFavorite(actualSource, actualId, {
            title: actualTitle,
            source_name: source_name || '',
            year: actualYear || '',
            cover: actualPoster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          setFavorited(true);
        }
      } catch (err) {
        throw new Error('切换收藏状态失败');
      }
    },
    [
      from,
      actualSource,
      actualId,
      actualTitle,
      source_name,
      actualYear,
      actualPoster,
      actualEpisodes,
      favorited,
    ]
  );

  const handleDeleteRecord = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from !== 'playrecord' || !actualSource || !actualId) return;
      try {
        await deletePlayRecord(actualSource, actualId);
        onDelete?.();
      } catch (err) {
        throw new Error('删除播放记录失败');
      }
    },
    [from, actualSource, actualId, onDelete]
  );

  const handleClick = useCallback(() => {
    if (from === 'douban') {
      router.push(
        `/play?title=${encodeURIComponent(actualTitle.trim())}${
          actualYear ? `&year=${actualYear}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`
      );
    } else if (actualSource && actualId) {
      router.push(
        `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
          actualTitle
        )}${actualYear ? `&year=${actualYear}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`
      );
    }
  }, [
    from,
    actualSource,
    actualId,
    router,
    actualTitle,
    actualYear,
    isAggregate,
    actualQuery,
    actualSearchType,
  ]);

  const config = useMemo(() => {
    const configs = {
      playrecord: {
        showSourceName: true,
        showProgress: true,
        showPlayButton: true,
        showHeart: true,
        showCheckCircle: true,
        showDoubanLink: false,
        showRating: false,
      },
      favorite: {
        showSourceName: true,
        showProgress: false,
        showPlayButton: true,
        showHeart: true,
        showCheckCircle: false,
        showDoubanLink: false,
        showRating: false,
      },
      search: {
        showSourceName: true,
        showProgress: false,
        showPlayButton: true,
        showHeart: !isAggregate,
        showCheckCircle: false,
        showDoubanLink: !!actualDoubanId,
        showRating: false,
      },
      douban: {
        showSourceName: false,
        showProgress: false,
        showPlayButton: true,
        showHeart: false,
        showCheckCircle: false,
        showDoubanLink: true,
        showRating: !!rate,
      },
    };
    return configs[from] || configs.search;
  }, [from, isAggregate, actualDoubanId, rate]);

  return (
    <div
      className='group relative w-full rounded-2xl bg-transparent transition-all duration-500 ease-out hover:z-[500] p-2 hover:glass-card glass-hover'
      onClick={handleClick}
    >
      {/* 海报容器 */}
      <div className='relative aspect-[2/3] overflow-hidden rounded-xl shadow-lg group-hover:shadow-2xl transition-all duration-500'>
        {/* 骨架屏 */}
        {!isLoading && <ImagePlaceholder aspectRatio='aspect-[2/3]' />}
        {/* 图片 */}
        <Image
          src={processImageUrl(actualPoster)}
          alt={actualTitle}
          fill
          className='object-cover transform transition-transform duration-700 ease-out group-hover:scale-110'
          referrerPolicy='no-referrer'
          onLoadingComplete={() => setIsLoading(true)}
        />

        {/* 悬浮遮罩 */}
        <div className='absolute inset-0 bg-gradient-to-t from-violet-900/90 via-violet-900/20 to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100' />

        {/* 播放按钮 */}
        {config.showPlayButton && (
          <div className='absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-500 ease-out delay-75 group-hover:opacity-100 group-hover:scale-100'>
            <div className='p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_30px_rgba(139,92,246,0.5)] group-hover:shadow-[0_0_50px_rgba(139,92,246,0.8)] transition-all'>
              <PlayCircleIcon
                size={40}
                strokeWidth={1.5}
                className='text-white fill-white/20'
              />
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        {(config.showHeart || config.showCheckCircle) && (
          <div className='absolute bottom-3 right-3 flex gap-3 opacity-0 translate-y-4 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:translate-y-0'>
            {config.showCheckCircle && (
              <div
                className='p-2 rounded-xl bg-black/40 backdrop-blur-sm hover:bg-violet-600/80 transition-colors cursor-pointer'
                onClick={handleDeleteRecord}
              >
                <CheckCircle size={18} className='text-white' />
              </div>
            )}
            {config.showHeart && (
              <div
                className='p-2 rounded-xl bg-black/40 backdrop-blur-sm hover:bg-pink-600/80 transition-colors cursor-pointer'
                onClick={handleToggleFavorite}
              >
                <Heart
                  size={18}
                  className={`transition-all duration-300 ${
                    favorited
                      ? 'fill-white stroke-white'
                      : 'fill-transparent stroke-white'
                  }`}
                />
              </div>
            )}
          </div>
        )}

        {/* 徽章 */}
        {config.showRating && rate && (
          <div className='absolute top-2 right-2 bg-violet-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg border border-white/10'>
            {rate}
          </div>
        )}

        {actualEpisodes && actualEpisodes > 1 && (
          <div className='absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-1 rounded-lg border border-white/10'>
            {currentEpisode
              ? `${currentEpisode}/${actualEpisodes}`
              : actualEpisodes}
          </div>
        )}

        {/* 豆瓣链接 */}
        {config.showDoubanLink && actualDoubanId && (
          <a
            href={`https://movie.douban.com/subject/${actualDoubanId}`}
            target='_blank'
            rel='noopener noreferrer'
            onClick={(e) => e.stopPropagation()}
            className='absolute bottom-2 left-2 opacity-0 -translate-x-2 transition-all duration-500 ease-out delay-100 group-hover:opacity-100 group-hover:translate-x-0'
          >
            <div className='bg-green-600/90 text-white p-1.5 rounded-lg hover:bg-green-500 transition-colors shadow-lg'>
              <Link size={14} />
            </div>
          </a>
        )}
      </div>

      {/* 进度条 */}
      {config.showProgress && progress !== undefined && (
        <div className='absolute bottom-0 left-2 right-2 h-1 bg-gray-200/20 rounded-full overflow-hidden mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
          <div
            className='h-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)]'
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 标题与来源 */}
      <div className='mt-3 text-center'>
        <div className='relative px-1'>
          <span className='block text-sm font-bold truncate text-gray-800 dark:text-gray-100 transition-colors duration-300 group-hover:text-violet-600 dark:group-hover:text-violet-400'>
            {actualTitle}
          </span>
        </div>
        {config.showSourceName && source_name && (
          <div className='mt-2 flex justify-center'>
            <span className='inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100/50 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-white/10 group-hover:border-violet-500/30 group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors duration-300'>
              {source_name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
