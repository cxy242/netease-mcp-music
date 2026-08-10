#!/bin/bash
# 月汐音乐花园 - 紧急恢复脚本
# 从最近的备份恢复数据文件

BACKUP_DIR="/opt/music_site/backups"
SONGS_FILE="/opt/music_site/all_liked_songs.json"
LOG_FILE="/opt/music_site/guardian.log"

echo "=== 月汐音乐花园 - 紧急恢复 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"

# 检查备份目录
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
    echo "❌ 没有找到备份文件"
    exit 1
fi

# 找最新备份
LATEST=$(ls -t "$BACKUP_DIR"/songs_*.json.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
    echo "❌ 没有找到有效的备份"
    exit 1
fi

echo "📦 找到最新备份: $(basename $LATEST)"
echo "   大小: $(du -h "$LATEST" | cut -f1)"

# 备份当前损坏的文件
if [ -f "$SONGS_FILE" ]; then
    cp "$SONGS_FILE" "${SONGS_FILE}.corrupted.$(date +%s)"
    echo "💾 已备份当前文件"
fi

# 恢复
gunzip -c "$LATEST" > "$SONGS_FILE"
if [ $? -eq 0 ]; then
    # 验证JSON
    python3 -c "import json; json.load(open('$SONGS_FILE'))" 2>/dev/null
    if [ $? -eq 0 ]; then
        SONGS=$(python3 -c "import json; s=json.load(open('$SONGS_FILE')); print(len(s))")
        URLS=$(python3 -c "import json; s=json.load(open('$SONGS_FILE')); print(sum(1 for x in s if x.get('url')))")
        echo "✅ 恢复成功！"
        echo "   歌曲数: $SONGS"
        echo "   有直链: $URLS"
        
        # 重新生成网站数据
        cd /opt/music_site
        python3 -c "
import json
songs = json.load(open('all_liked_songs.json'))
data = [{'n':s.get('name',''),'a':s.get('artist',''),'u':s.get('url',''),'i':s.get('id',''),'d':s.get('duration',0)} for s in songs]
with open('songs_data.js','w') as f: f.write('const SONGS = ' + json.dumps(data, ensure_ascii=False) + ';')
print('✅ 网站数据已重新生成')
"
        
        echo ""
        echo "恢复完成！如果网站还在运行，刷新页面即可看到数据。"
        echo "如果守护进程已停止，请运行: /opt/music_site/startup.sh"
    else
        echo "❌ 恢复的文件不是有效的JSON，可能备份也损坏了"
        exit 1
    fi
else
    echo "❌ 解压失败"
    exit 1
fi
