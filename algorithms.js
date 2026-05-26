const Algo = {
    sortHome: function(data) {
        return [...data].sort((a, b) => b.id - a.id);
    },
    sortPlace: function(data) {
        return this.groupAndSort(data, 'place', (a, b) => b.id - a.id, 'place');
    },
    sortType: function(data) {
        return this.groupAndSort(data, 'type', (a, b) => {
            let partA = parseInt(a.partno) || 0;
            let partB = parseInt(b.partno) || 0;
            return partB - partA; 
        }, 'displaytype');
    },
    groupAndSort: function(data, groupKey, sortRule, displayKey) {
        const categories = [...new Set(data.map(item => item[groupKey]))];
        let playlists = [];
        categories.forEach(category => {
            let items = data.filter(item => item[groupKey] === category);
            items.sort(sortRule); 
            let maxId = Math.max(...items.map(i => i.id));
            let displayStr = category;
            if (displayKey && items[0] && items[0][displayKey]) {
                displayStr = items[0][displayKey];
            }
            playlists.push({ category, displayCategory: displayStr, items, maxId });
        });
        return playlists.sort((a, b) => b.maxId - a.maxId);
    },
    getRecommendations: function(currentTrack, context, allData) {
        let recs = [];
        let excludeIds = new Set([currentTrack.id]); 

        const addRecs = (items, limit) => {
            let added = 0;
            for (let item of items) {
                if (added >= limit) break;
                if (!excludeIds.has(item.id)) {
                    recs.push(item);
                    excludeIds.add(item.id);
                    added++;
                }
            }
        };

        let sequenceItems = [];
        if (context.type === 'playlist') {
            let idx = context.list.findIndex(t => t.id === currentTrack.id);
            if (idx === context.list.length - 1) {
                sequenceItems = context.list.slice(Math.max(0, idx - 5), idx).reverse();
            } else {
                sequenceItems = context.list.slice(idx + 1, idx + 6);
            }
        } else {
            let sortedById = [...allData].sort((a, b) => a.id - b.id);
            let idx = sortedById.findIndex(t => t.id === currentTrack.id);
            if (idx === sortedById.length - 1) {
                sequenceItems = sortedById.slice(Math.max(0, idx - 5), idx).reverse();
            } else {
                sequenceItems = sortedById.slice(idx + 1, idx + 6);
            }
        }
        addRecs(sequenceItems, 5);

        let typeItems = allData.filter(t => t.type === currentTrack.type);
        addRecs(typeItems, 3);

        let placeItems = allData.filter(t => t.place === currentTrack.place);
        addRecs(placeItems, 2);

        if (recs.length < 10) {
            let shuffled = [...allData].sort(() => 0.5 - Math.random());
            addRecs(shuffled, 10 - recs.length);
        }
        return recs;
    }
};