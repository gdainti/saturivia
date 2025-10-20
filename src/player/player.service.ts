import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Player, PlayerDocument } from 'src/schemas/player.shema';
import { PlayerAnswer, PlayerAnswerDocument } from 'src/schemas/player-answer.schema';

export interface UpsertAnswerResult {
	created: boolean;
	score: number;
}

@Injectable()
export class PlayerService {
	private readonly logger = new Logger(PlayerService.name);
	constructor(
		@InjectModel(Player.name) private playerModel: Model<PlayerDocument>,
		@InjectModel(PlayerAnswer.name) private playerAnswerModel: Model<PlayerAnswerDocument>,
	) {}

	async findOrCreatePlayer(telegramId: number, username?: string) {
		const existing = await this.playerModel.findOne({ telegramId }).exec();
		if (existing) return existing;
		const created = await this.playerModel.create({ telegramId, username });
		return created;
	}

	async recordPlayerAnswer(questionId: string, playerId: string, score = 1): Promise<UpsertAnswerResult> {
		try {
			const res = await this.playerAnswerModel.findOneAndUpdate(
				{ questionId, playerId },
				{ $inc: { score }, $setOnInsert: { isDeleted: false } },
				{ upsert: true, new: true, setDefaultsOnInsert: true }
			).exec();

			return { created: true, score: (res as any).score };
		} catch (err) {
			this.logger.error('Failed to record player answer', err);
			throw err;
		}
	}

	async getTopPlayers(limit = 5) {
		const pipeline = [
			{ $match: { isDeleted: false } },
			{ $group: { _id: '$playerId', totalScore: { $sum: '$score' } } },
			{ $sort: { totalScore: -1 } },
			{ $limit: limit },
			{
				$lookup: {
					from: 'players',
					localField: '_id',
					foreignField: '_id',
					as: 'player'
				}
			},
			{ $unwind: '$player' },
			{ $project: { playerId: '$_id', totalScore: 1, username: '$player.username', telegramId: '$player.telegramId' } }
		];

		const res = await this.playerAnswerModel.aggregate(pipeline as any).exec();
		return res as Array<{ playerId: string; totalScore: number; username?: string; telegramId?: number }>;
	}
}
