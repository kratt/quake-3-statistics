/**
 * Quake 3 statistics
 *
 * 13.11.2017
 * Julian Kratt
 * Julian.Kratt@googlemail.com
 */

QuakeStats = function(logFileUrl)
{
    this.logFile = '';

    // stores individual games (players, scores, map, date etc...)
    this.games = new Array();

    // stores all player names and total num played games
    this.players = new Array();

    this.load_log(logFileUrl);
    this.set_games();

    // sort players by num played games
    this.players.sort(function(a, b){return b.numGames- a.numGames});

    this.games.reverse();

    // print info
    //this.print_info();
}

QuakeStats.prototype = {

    load_log : function (logFileUrl) {
        var http = new XMLHttpRequest();

        // force to reload data file every time
        http.open("GET", logFileUrl+'?'+(new Date()).getTime(), false);
        http.send(null);
        this.logFile = http.responseText;
    },

    set_games : function()
    {
        var lines = this.logFile.split('\n');

        var initGame = false;
        var gameEnded = false;
        var gameLog = "";

        for(var i = 0;i < lines.length;i++)
        {
            var curLine = lines[i];

            if(/InitGame/.test(curLine)) {
                initGame = true;
            }

            if(/Exit: Timelimit hit/.test(curLine)) {
                gameEnded = true;
            }

            if (initGame)
                gameLog += curLine + '\n';

            if(/ShutdownGame/.test(curLine))
            {
                // if we had a valid game, save it
                if (initGame )
                    if(gameEnded)
                    {
                        this.process_game(gameLog);
                    }

                // reset
                initGame = false;
                gameEnded = false;
                gameLog = "";
            }
        }
    },

	set_next_score_in_timeline : function(game, playerId, time, delta)
	{
		var scoreTimeLine = game.players[playerId].scoreTimeLine;
		var lastScore = scoreTimeLine[scoreTimeLine.length-1].score;

		// set new score
		scoreTimeLine.push({time : time - game.startTime,
		                   score : lastScore + delta});
	},
	
    process_game : function(gameLog)
    {
        var game = {};
        game.players = new Array();

        var lines = gameLog.split('\n');
        for(var i = 0;i < lines.length;i++)
        {
            var curLine = lines[i];

            // get map name
            if(/InitGame/.test(curLine))
            {
                var tokens = curLine.split('\\');
                var idx = tokens.indexOf('mapname');
                game.mapName = tokens[idx+1];
            }

            // read server time
            if(/ServerTime/.test(curLine))
            {
                var tokens = curLine.split('\t');
                var time = tokens[1];

                // format time 20131004222300 -> 2013-10-04 22:23:00)
                var formated = time.substring(0, 4) + "-" + time.substring(4, 6) + "-" + time.substring(6, 8) + " " + time.substring(8, 10)  + ":" + time.substring(10, 12)  + ":" + time.substring(12, 14);
                game.time = formated;
            }

            // get connected players and ids
            if(/ClientUserinfoChanged/.test(curLine))
            {
                var tokens = curLine.split(' ');
                var id = tokens[2];

                // get name
                var tmp = tokens[3].split('\\');

                // create new player
                var player = {  name :  tmp[1],
                                rageQuit : true,
                                accMgun : -1,
                                accRgun : -1,
                                accRock : -1,
                                accShot : -1,
                                accPlas : -1,
                                accGlau : -1,
                                dmgGiven : 0,
                                dmgRecvd : 0,
                                numTeleporter : -1,
                                numArmorCombat : -1,
                                numArmorBody : -1,
                                numQuad : -1,
                                numHealthSmall : -1,
                                numHealthLarge : -1,
                                killingStreak : 0,
                                tmpKillingStreak : 0,
                                lastKillTime : 0,       // the last time the player was killed
                                spawnKills : [],
                                kills : [],
                                score : 0,  // rage quit players would have a score of 0,
                                suicides : 0,
								scoreTimeLine : [{time : 0, score : 0}], // stores the history of kills <time, currentScore>
                                chatTimeLine : [] // stores the history of chats <time, currentScore, chat>
                            };
                game.players[id] = player;
				
				var start_time = tokens[0];
				game.startTime = start_time; // is written multiple times /for each player connected;
            }

            // record kills
            if(/Kill/.test(curLine))
            {
                var tokens = curLine.split(' ');
                var s_id = tokens[2];  // s_id killed t_id
                var t_id = tokens[3];
				var cur_time = tokens[0];

                // id 1022 == world
                if(s_id != 1022)
                {
                   var kills = game.players[s_id].kills;
                   if(kills[t_id] == undefined) { // init
                       kills[t_id] = 0;
                   }
                    kills[t_id]++;
				
					if(s_id != t_id){
                        this.set_next_score_in_timeline(game, s_id, cur_time, 1);

                        game.players[s_id].tmpKillingStreak++;

                        // reset killing streak for player t_id (since he was hit) and check for max killing streak
                        game.players[t_id].killingStreak = Math.max(game.players[t_id].tmpKillingStreak, game.players[t_id].killingStreak);
                        game.players[t_id].tmpKillingStreak = 0;
                    }
					else{ // player killed himself -1
                        this.set_next_score_in_timeline(game, s_id, cur_time, -1);
                        game.players[s_id].suicides++;

                        // stop killing streak and reset tmp counter for kills
                        game.players[s_id].killingStreak = Math.max(game.players[s_id].tmpKillingStreak, game.players[s_id].killingStreak);
                        game.players[s_id].tmpKillingStreak = 0;
                    }

                    // check for spawn kill
                    var spawnKillThreshold = 10; // in seconds
                    var lastKillTime = game.players[t_id].lastKillTime;  // last time the player (t_id) was killed

                    if(cur_time - lastKillTime < spawnKillThreshold)
                    {
                        var spawnKills = game.players[s_id].spawnKills;
                        if(spawnKills[t_id] == undefined) { // init
                            spawnKills[t_id] = 0;
                        }

                        spawnKills[t_id]++;
                    }
				}
				else if(s_id == 1022) // the world (s_id) killed player (t_id)
				{
					this.set_next_score_in_timeline(game, t_id, cur_time, -1);
                    game.players[t_id].suicides++;

                    // stop killing streak and reset tmp counter for kills
                    game.players[t_id].killingStreak = Math.max(game.players[t_id].tmpKillingStreak, game.players[t_id].killingStreak);
                    game.players[t_id].tmpKillingStreak = 0;
				}

                // set for killed player (t_id) the time of the kill
                game.players[t_id].lastKillTime = cur_time;
            }

            // read scores
            if(/score/.test(curLine))
            {
                var tokens = curLine.split(' ');
                var size = tokens.length;
                var id = tokens[size-2];

                if(game.players[id] == undefined)
                    return;

                game.players[id].score = tokens[2];
                game.players[id].rageQuit = false;
            }

            // read weapon statstics (accuracy, dmg given and received etc.)
            if(/Weapon_Stats/.test(curLine))
            {
                curLine = curLine.split(":").join(" ");

                var tokens = curLine.split(' ');
                var id = tokens[3];

                // get accuracy of each weapon, if available
                var idx_mgun = tokens.indexOf('MachineGun');
                var idx_rgun = tokens.indexOf('Railgun');
                var idx_rock = tokens.indexOf('R.Launcher');
                var idx_shot = tokens.indexOf('Shotgun');
                var idx_plas = tokens.indexOf('Plasmagun');
                var idx_glau = tokens.indexOf('G.Launcher');

                if(idx_mgun != -1){
                    if(tokens[idx_mgun+1] != 0.0)
                        game.players[id].accMgun = tokens[idx_mgun+2] / tokens[idx_mgun+1];
                    else
                        game.players[id].accMgun = 0.0;
                }

                if(idx_rgun != -1){
                    if(tokens[idx_rgun+1] != 0.0)
                        game.players[id].accRgun = tokens[idx_rgun+2] / tokens[idx_rgun+1];
                    else
                        game.players[id].accRgun = 0.0;
                }

                if(idx_rock != -1){
                    if(tokens[idx_rock+1] != 0.0)
                        game.players[id].accRock = tokens[idx_rock+2] / tokens[idx_rock+1];
                    else
                        game.players[id].accRock = 0.0;
                }

                if(idx_shot != -1){
                    if(tokens[idx_shot+1] != 0.0)
                        game.players[id].accShot = tokens[idx_shot+2] / tokens[idx_shot+1];
                    else
                        game.players[id].accShot = 0.0;
                }

                if(idx_plas != -1){
                    if(tokens[idx_plas+1] != 0.0)
                        game.players[id].accPlas = tokens[idx_plas+2] / tokens[idx_plas+1];
                    else
                        game.players[id].accPlas = 0.0;
                }

                if(idx_glau != -1){
                    if(tokens[idx_glau+1] != 0.0)
                        game.players[id].accGlau = tokens[idx_glau+2] / tokens[idx_glau+1];
                    else
                        game.players[id].accGlau = 0.0;

                }

                var idx_giv = tokens.indexOf('Given');
                var idx_rec = tokens.indexOf('Recvd');

                game.players[id].dmgGiven = tokens[idx_giv+1];
                game.players[id].dmgRecvd = tokens[idx_rec+1];
            }

            // read item
            if(/Item/.test(curLine))
            {
                var tokens = curLine.split(' ');
                var id = tokens[2];
                var item = tokens[3];

                if(item == 'holdable_teleporter'){
                    if(game.players[id].numTeleporter < 0)
                        game.players[id].numTeleporter = 0;

                    game.players[id].numTeleporter++;
                }

                if(item == 'item_armor_combat'){
                    if(game.players[id].numArmorCombat < 0)
                        game.players[id].numArmorCombat = 0;

                    game.players[id].numArmorCombat++;
                }

                if(item == 'item_armor_body'){
                    if(game.players[id].numArmorBody < 0)
                        game.players[id].numArmorBody = 0;

                    game.players[id].numArmorBody++;
                }

                if(item == 'item_quad'){
                    if(game.players[id].numQuad < 0)
                        game.players[id].numQuad = 0;

                    game.players[id].numQuad++;
                }

                if(item == 'item_health_small'){
                    if(game.players[id].numHealthSmall < 0)
                        game.players[id].numHealthSmall = 0;

                    game.players[id].numHealthSmall++;
                }

                if(item == 'item_health_large'){
                    if(game.players[id].numHealthLarge < 0)
                        game.players[id].numHealthLarge = 0;

                    game.players[id].numHealthLarge++;
                }
            }

            // read chat
            if(/say/.test(curLine))
            {
                var tokens = curLine.split(' ');
                var chat = "";
                for(var j=2; j<tokens.length; ++j)
                {
                    chat = chat.concat(" ");
                    chat = chat.concat(tokens[j]);
                }

                // player name given by "me:"
                var playerName = tokens[2];
                playerName = playerName.substr(0, playerName.length-1);

                var player = this.get_player_by_name(game, playerName);

                if(player != null)
                {
                    // get latest time and score of player
                    var curTime = player.scoreTimeLine[player.scoreTimeLine.length-1].time;
                    var curScore = player.scoreTimeLine[player.scoreTimeLine.length-1].score;
                    player.chatTimeLine.push({time : curTime, score : curScore, chat : chat});
                }
            }
        }


        // check if players had unique names, if not skip game
        if(this.has_unique_players(game))
        {
            // sort players by score
            //game.players.sort(function(a, b){return b.score- a.score});

            // include player names into global array
            // check if we already have the player name
            for(var i in game.players)
            {
                var tmpPlayer = game.players[i];
                // check if we have it already
                var idx = -1;
                for(var j=0; j<this.players.length; ++j)
                {
                    if(this.players[j].name == tmpPlayer.name)
                        idx = j;
                }

                // we also track the total number of games
                if(idx == -1)
                    this.players.push({name : tmpPlayer.name, numGames : 1});
                else
                    this.players[idx].numGames++;
            }

            // add players to global array
            this.games.push(game);

          //  this.print_kill_info(game);
        }
    },

    has_unique_players : function(game)
    {
        var players = game.players;

        for(var i in players) {
            for(var j in players) {
                if(i==j) continue;

                if(players[i].name == players[j].name)
                    return false;
            }
        }

        return true;
    },

    print_info : function()
    {
        console.log('num games: ' + this.games.length);

        for (var i = 0; i < this.games.length; i++) {
            console.log("\n-------------");
            var g = this.games[i];
            console.log(g.mapName);
            console.log(g.time);

            for (var id in  g.players) {
                console.log(g.players[id]);
            }

            console.log("-------------");
        }

        console.log('QuakeStats finished! #games: '+ this.games.length);

        for(var i=0; i<this.players.length; ++i)
            console.log(this.players[i]);
    },

    print_info : function(game)
    {
        for (var id in  game.players) {
            console.log(game.players[id]);
        }
    },

    get_player_by_name : function(game, name)
    {
        var players = game.players;
        for(var i in players) {
            if(game.players[i].name == name)
            return game.players[i];
        }
        return null;
    },

    print_kill_info : function(game)
    {
        for (var id in  game.players) {
            console.log(id + " " + game.players[id].name);
        }

        for (var id in  game.players) {
           console.log(game.players[id].name + " " + game.players[id].kills + "  length:" + game.players[id].kills.length);
        }
    }
};